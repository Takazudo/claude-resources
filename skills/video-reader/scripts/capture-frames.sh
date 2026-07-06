#!/usr/bin/env bash
set -euo pipefail

# Extracts still frames from a local video file or a YouTube video at a fixed
# interval, into the repo-scoped cclogs dir resolved by get-logdir.js.
#
# Usage:
#   capture-frames.sh <video-path-or-youtube-url-or-id> [--interval=N] [--force] [--parse-only]
#
# stdout contract (machine-readable):
#   <abs-jpg-path>\t<seconds>\t<HH-MM-SS>   (one row per frame, chronological)
#   # summary: frames=<N> duration=<D> captures_dir=<abs-path>
# All human-facing chatter goes to stderr.

err() { echo "Error: $*" >&2; }
info() { echo "$*" >&2; }

usage() {
  cat >&2 <<'EOF'
Usage:
  capture-frames.sh <video-path-or-youtube-url-or-id> [--interval=N] [--force] [--parse-only]

  --interval=N   Capture one frame every N seconds (integer >= 1, default 2)
  --force        Wipe existing captures for this video+interval and re-extract
  --parse-only   Print the classified input (mode + resolved path/ID) and exit
EOF
  exit 1
}

INPUT=""
INTERVAL_RAW="2"
FORCE=0
PARSE_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --interval=*) INTERVAL_RAW="${arg#--interval=}" ;;
    --force) FORCE=1 ;;
    --parse-only) PARSE_ONLY=1 ;;
    --help|-h) usage ;;
    --*) err "Unknown option: $arg"; usage ;;
    *)
      if [[ -n "$INPUT" ]]; then
        err "Unexpected extra argument: $arg"
        usage
      fi
      INPUT="$arg"
      ;;
  esac
done

[[ -n "$INPUT" ]] || usage

if [[ ! "$INTERVAL_RAW" =~ ^[0-9]+$ ]]; then
  err "Interval must be a positive integer (got: $INTERVAL_RAW)"
  exit 1
fi
INTERVAL=$((10#$INTERVAL_RAW))
if (( INTERVAL < 1 )); then
  err "Interval must be at least 1 second (got: $INTERVAL_RAW)"
  exit 1
fi

# --- Input classification -----------------------------------------------------

MODE=""
VIDEO_ID=""
SOURCE_PATH=""

# Anchored YouTube ID extraction. A bare token counts only when the ENTIRE
# argument is a valid 11-char ID (and is not an existing file, checked first).
extract_youtube_id() {
  local url="$1"
  if [[ "$url" =~ ^https?://(www\.|m\.)?youtu\.be/([A-Za-z0-9_-]{11})([?&/].*)?$ ]]; then
    echo "${BASH_REMATCH[2]}"; return 0
  fi
  if [[ "$url" =~ ^https?://(www\.|m\.)?youtube\.com/watch\?[^#]*v=([A-Za-z0-9_-]{11})([^A-Za-z0-9_-].*)?$ ]]; then
    echo "${BASH_REMATCH[2]}"; return 0
  fi
  if [[ "$url" =~ ^https?://(www\.|m\.)?youtube\.com/shorts/([A-Za-z0-9_-]{11})([?&/].*)?$ ]]; then
    echo "${BASH_REMATCH[2]}"; return 0
  fi
  if [[ "$url" =~ ^https?://(www\.|m\.)?youtube\.com/embed/([A-Za-z0-9_-]{11})([?&/].*)?$ ]]; then
    echo "${BASH_REMATCH[2]}"; return 0
  fi
  if [[ "$url" =~ ^[A-Za-z0-9_-]{11}$ ]]; then
    echo "$url"; return 0
  fi
  return 1
}

if [[ -f "$INPUT" ]]; then
  MODE="local"
  SOURCE_PATH="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
elif VIDEO_ID="$(extract_youtube_id "$INPUT")"; then
  MODE="youtube"
else
  err "Input is neither an existing file nor a recognizable YouTube URL/ID: $INPUT"
  exit 1
fi

if (( PARSE_ONLY )); then
  if [[ "$MODE" == "local" ]]; then
    printf 'local\t%s\n' "$SOURCE_PATH"
  else
    printf 'youtube\t%s\n' "$VIDEO_ID"
  fi
  exit 0
fi

# --- Dependency checks --------------------------------------------------------

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  err "ffmpeg/ffprobe are required. Install with: brew install ffmpeg"
  exit 1
fi
if [[ "$MODE" == "youtube" ]] && ! command -v yt-dlp >/dev/null 2>&1; then
  err "yt-dlp is required for YouTube input. Install with: brew install yt-dlp"
  exit 1
fi

# --- Resolve session dir ------------------------------------------------------

LOGDIR="$(node "$HOME/.claude/scripts/get-logdir.js")"

hash8_of() {
  if command -v md5 >/dev/null 2>&1; then
    printf '%s' "$1" | md5 | awk '{print $NF}' | cut -c1-8
  else
    printf '%s' "$1" | md5sum | awk '{print $1}' | cut -c1-8
  fi
}

if [[ "$MODE" == "local" ]]; then
  base="$(basename "$SOURCE_PATH")"
  base="${base%.*}"
  base="$(printf '%s' "$base" | sed 's/[^a-zA-Z0-9._-]/_/g')"
  SESSION_NAME="${base}-$(hash8_of "$SOURCE_PATH")"
else
  SESSION_NAME="$VIDEO_ID"
fi

SESSION_DIR="$LOGDIR/video-reader/$SESSION_NAME"
mkdir -p "$SESSION_DIR"

# --- YouTube download ---------------------------------------------------------

if [[ "$MODE" == "youtube" ]]; then
  VIDEO_FILE="$SESSION_DIR/movies/video.mp4"
  if [[ -f "$VIDEO_FILE" ]]; then
    info "Reusing downloaded video: $VIDEO_FILE"
  else
    mkdir -p "$SESSION_DIR/movies"
    info "Downloading YouTube video $VIDEO_ID ..."
    yt-dlp \
      -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
      --merge-output-format mp4 \
      -o "$SESSION_DIR/movies/video.%(ext)s" \
      "https://www.youtube.com/watch?v=$VIDEO_ID" >&2
    if [[ ! -f "$VIDEO_FILE" ]]; then
      err "yt-dlp did not produce $VIDEO_FILE"
      exit 1
    fi
  fi
else
  VIDEO_FILE="$SOURCE_PATH"
fi

# --- Staleness-aware reuse ----------------------------------------------------

CAPTURES_DIR="$SESSION_DIR/captures-${INTERVAL}s"
META_FILE="$CAPTURES_DIR/.meta"

# Size + mtime signature; stat flags differ between macOS and Linux.
# Probe the GNU form first: on GNU/Linux `stat -f` succeeds as "filesystem
# status" and would pollute the signature with volatile fs stats.
file_sig() {
  if stat -c '%s %Y' "$1" >/dev/null 2>&1; then
    stat -c '%s %Y' "$1"
  else
    stat -f '%z %m' "$1"
  fi
}

meta_content() { printf 'source=%s\nsig=%s\ninterval=%s\n' "$VIDEO_FILE" "$(file_sig "$VIDEO_FILE")" "$INTERVAL"; }

seconds_to_hms() {
  local total="$1"
  printf '%02d-%02d-%02d' $((total / 3600)) $(( (total % 3600) / 60 )) $((total % 60))
}

emit_frame_list() {
  local count=0 jpg name ts h m s seconds
  for jpg in "$CAPTURES_DIR"/capture-*.jpg; do
    [[ -f "$jpg" ]] || continue
    name="$(basename "$jpg" .jpg)"
    ts="${name#capture-}"
    IFS=- read -r h m s <<< "$ts"
    seconds=$(( 10#$h * 3600 + 10#$m * 60 + 10#$s ))
    printf '%s\t%s\t%s\n' "$jpg" "$seconds" "$ts"
    count=$((count + 1))
  done
  printf '# summary: frames=%s duration=%s captures_dir=%s\n' "$count" "$DURATION_DISPLAY" "$CAPTURES_DIR"
}

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null || echo "N/A")"
if [[ "$DURATION" =~ ^[0-9.]+$ ]]; then
  DURATION_DISPLAY="${DURATION}s"
else
  DURATION="N/A"
  DURATION_DISPLAY="unknown"
fi

if (( FORCE )) && [[ -d "$CAPTURES_DIR" ]]; then
  info "--force: removing existing $CAPTURES_DIR"
  (cd "$SESSION_DIR" && rm -rf "./captures-${INTERVAL}s")
fi

if [[ -d "$CAPTURES_DIR" ]] && compgen -G "$CAPTURES_DIR/capture-*.jpg" >/dev/null; then
  if [[ -f "$META_FILE" ]] && [[ "$(cat "$META_FILE")" == "$(meta_content)" ]]; then
    info "Reusing existing captures in $CAPTURES_DIR (source unchanged; use --force to re-extract)"
    emit_frame_list
    exit 0
  fi
  info "Source changed since last extraction (or metadata missing) — re-extracting"
  (cd "$SESSION_DIR" && rm -rf "./captures-${INTERVAL}s")
fi

# --- Frame estimate warning ---------------------------------------------------

if [[ "$DURATION" != "N/A" ]]; then
  EST_FRAMES="$(awk -v d="$DURATION" -v i="$INTERVAL" 'BEGIN { print int((d + i - 1) / i) }')"
  if (( EST_FRAMES > 200 )); then
    info "WARNING: ~${EST_FRAMES} frames estimated (duration ${DURATION_DISPLAY}, interval ${INTERVAL}s)."
    info "         Consider a larger interval (e.g. --interval=$((INTERVAL * 5))). Proceeding anyway."
  fi
fi

# --- Extraction (atomic: temp dir inside the session dir, mv on success) ------

TMP_DIR="$(mktemp -d "$SESSION_DIR/.tmp-extract-XXXXXX")"
cleanup() { [[ -d "${TMP_DIR:-}" ]] && rm -rf "${TMP_DIR:?}"; }
trap cleanup EXIT

info "Extracting frames every ${INTERVAL}s from: $VIDEO_FILE"
ffmpeg -hide_banner -loglevel error \
  -i "$VIDEO_FILE" \
  -vf "setpts=PTS-STARTPTS,fps=1/$INTERVAL" \
  -q:v 2 \
  "$TMP_DIR/capture-%06d.jpg"

frame_num=0
for f in "$TMP_DIR"/capture-*.jpg; do
  [[ -f "$f" ]] || continue
  # ffmpeg numbers from 000001; frame k is at nominal t=(k-1)*interval
  mv "$f" "$TMP_DIR/capture-$(seconds_to_hms $((frame_num * INTERVAL))).jpg"
  frame_num=$((frame_num + 1))
done

if (( frame_num == 0 )); then
  err "ffmpeg produced no frames from $VIDEO_FILE"
  exit 1
fi

meta_content > "$TMP_DIR/.meta"
mv "$TMP_DIR" "$CAPTURES_DIR"
trap - EXIT

info "Extracted $frame_num frames into $CAPTURES_DIR"
emit_frame_list
