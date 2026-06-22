#!/usr/bin/env bash
# Generate or redesign a raster image via Codex CLI's built-in $imagegen,
# billed to ChatGPT-included usage (NOT the OpenAI image API).
#
# It forces the ChatGPT path by unsetting OPENAI_API_KEY for the codex
# subprocess — otherwise a key in the environment can flip Codex to per-image
# API billing.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: codex-imagegen.sh --prompt <text> [--out <path>] [--in <image>]... [--size WxH]

  --prompt   What to generate, or how to redesign the input image (required).
  --out      Output PNG. Optional. A bare name or relative path lands under the
             repo-scoped cclogs dir (<cclogs>/<repo>/imagegen/); an absolute
             path is used as-is. Omitted -> auto-named from the prompt there.
  --in       Input image to attach as vision/edit source. Repeatable
             (e.g. a screenshot to redesign, plus a style reference).
  --size     Exact output WxH in pixels (e.g. 600x600). imagegen emits a preset
             size; this hard-resizes via sips (macOS) or ImageMagick/Pillow (Linux/WSL).

Examples:
  codex-imagegen.sh --prompt "a flat red apple on white"
  codex-imagegen.sh --out apple.png --prompt "a flat red apple on white"
  codex-imagegen.sh --size 600x600 --prompt "realistic photo of a bird and a fish"
  codex-imagegen.sh --out redesign.png --in screenshot.png \
    --prompt "redesign this pricing table to look premium; keep every number and column identical"
EOF
}

OUT=""
PROMPT=""
SIZE=""
INS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --out)    OUT="$2"; shift 2 ;;
    --prompt) PROMPT="$2"; shift 2 ;;
    --in)     INS+=("$2"); shift 2 ;;
    --size)   SIZE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

[ -n "$PROMPT" ] || { echo "ERROR: --prompt is required" >&2; usage; exit 2; }
command -v codex >/dev/null || { echo "ERROR: codex CLI not found on PATH" >&2; exit 1; }

# Default save location = repo-scoped, Dropbox-synced cclogs dir, resolved by the
# canonical helper (handles env var, platform defaults, worktrees, _misc fallback).
# Resolve before any cd so get-logdir reads the project's cwd, not this script's.
IMGDIR="$(node "$HOME/.claude/scripts/get-logdir.js" 2>/dev/null || true)/imagegen"
if [ -z "$OUT" ]; then
  slug="$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | cut -c1-40 | sed 's/^-*//;s/-*$//')"
  [ -n "$slug" ] || slug="image"
  OUT="$IMGDIR/${slug}-$(date +%Y%m%d-%H%M%S).png"
elif [ "${OUT#/}" = "$OUT" ]; then
  OUT="$IMGDIR/$OUT"   # relative name/path -> under the cclogs imagegen dir
fi

# Parse --size into W and H.
SW=""; SH=""
if [ -n "$SIZE" ]; then
  SW="${SIZE%%[xX]*}"; SH="${SIZE##*[xX]}"
  case "$SW$SH" in
    *[!0-9]*|"") echo "ERROR: --size must be WxH in pixels, e.g. 600x600" >&2; exit 2 ;;
  esac
fi

# Preflight: $imagegen draws on ChatGPT usage only when Codex is logged in with
# ChatGPT. Codex prints the status to stderr, so fold it in with 2>&1; capture
# to a var first so `grep -q` can't SIGPIPE codex under pipefail.
login_status="$(codex login status 2>&1 || true)"
if ! printf '%s' "$login_status" | grep -qi "ChatGPT"; then
  echo "WARNING: 'codex login status' does not report ChatGPT login." >&2
  echo "         Run 'codex login' first, or this may fall back to API billing / fail." >&2
fi

mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
WORKDIR="$(dirname "$OUT_ABS")"
rm -f "$OUT_ABS"

ASPECT_HINT=""
if [ -n "$SIZE" ]; then
  if [ "$SW" -eq "$SH" ]; then ASPECT_HINT=" Compose it as a square (1:1) image."
  elif [ "$SW" -gt "$SH" ]; then ASPECT_HINT=" Compose it as a landscape (wide) image."
  else ASPECT_HINT=" Compose it as a portrait (tall) image."; fi
fi

INSTRUCTION="Use \$imagegen to fulfill this request: ${PROMPT}.${ASPECT_HINT}
Save the final PNG to ${OUT_ABS}. Do NOT use any OPENAI_API_KEY/API fallback — use the built-in imagegen (ChatGPT) path only. After saving, print the absolute path and byte size of the PNG."

# Build one argv array (never empty) so optional -i flags don't trip set -u.
ARGS=(exec -C "$WORKDIR" -s workspace-write --skip-git-repo-check)
for img in "${INS[@]:-}"; do
  [ -n "$img" ] || continue
  [ -f "$img" ] || { echo "ERROR: input image not found: $img" >&2; exit 1; }
  ARGS+=(-i "$img")
done
ARGS+=(-o "${WORKDIR}/.codex-imagegen.last.txt" "$INSTRUCTION")

LOG="${WORKDIR}/.codex-imagegen.log"
echo "→ generating via codex \$imagegen (ChatGPT usage)…" >&2

# unset OPENAI_API_KEY: keep this on the ChatGPT-included billing path.
set +e
env -u OPENAI_API_KEY codex "${ARGS[@]}" >"$LOG" 2>&1
rc=$?
set -e

# Fallback: imagegen's native save location is $HOME/.codex/generated_images/.
# If Codex didn't honor the explicit path, grab the freshest one it just made.
if [ ! -f "$OUT_ABS" ]; then
  newest="$(ls -t "$HOME/.codex/generated_images"/*.png 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] && cp "$newest" "$OUT_ABS"
fi

if [ ! -f "$OUT_ABS" ]; then
  echo "ERROR: no image produced (codex exit $rc). Last 25 log lines:" >&2
  tail -25 "$LOG" >&2
  exit 1
fi

# Resize to exact WxH across platforms: sips (macOS) -> ImageMagick -> Pillow.
# The trailing '!' on ImageMagick -resize forces exact dims, matching `sips -z`.
resize_exact() { # w h file
  if command -v sips >/dev/null;   then sips -z "$2" "$1" "$3" >/dev/null 2>&1
  elif command -v magick >/dev/null;  then magick "$3" -resize "${1}x${2}!" "$3"
  elif command -v convert >/dev/null; then convert "$3" -resize "${1}x${2}!" "$3"
  elif command -v python3 >/dev/null; then python3 - "$3" "$1" "$2" <<'PY' 2>/dev/null
import sys
from PIL import Image
f, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
Image.open(f).resize((w, h)).save(f)
PY
  else return 2
  fi
}

png_dims() { # file -> "WxH" (empty if no tool)
  if command -v sips >/dev/null; then
    sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{if(w)print w"x"h}'
  elif command -v identify >/dev/null; then
    identify -format '%wx%h' "$1" 2>/dev/null
  elif command -v python3 >/dev/null; then
    python3 - "$1" <<'PY' 2>/dev/null
import sys
from PIL import Image
w, h = Image.open(sys.argv[1]).size
print(f"{w}x{h}")
PY
  fi
}

# Hard-resize to exact requested dimensions (imagegen only emits preset sizes).
if [ -n "$SIZE" ]; then
  resize_exact "$SW" "$SH" "$OUT_ABS" || \
    echo "WARNING: no image resizer (sips/ImageMagick/Pillow) available — left at native size (requested ${SIZE})" >&2
fi

tokens="$(grep -iA1 "tokens used" "$LOG" 2>/dev/null | tail -1 | tr -dc '0-9' || true)"
dims="$(png_dims "$OUT_ABS" || true)"
size="$(stat -f '%z' "$OUT_ABS" 2>/dev/null || stat -c '%s' "$OUT_ABS" 2>/dev/null || echo '?')"
echo "✓ saved: $OUT_ABS (${dims:+${dims}, }${size} bytes${tokens:+, ~${tokens} ChatGPT tokens used})"
