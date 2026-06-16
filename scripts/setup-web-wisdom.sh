#!/bin/bash
# scripts/setup-web-wisdom.sh
#
# Web-only SessionStart step: clone public wisdom repos into
# $HOME/.claude-wisdom/<repo> and run each repo's own `setup:doc-skill`
# to symlink wisdom skills into ~/.claude/skills/.
#
# Safety invariants:
#   - Web-only: no-ops outside Claude Code on the web.
#   - Each repo is isolated (set +e) so one failure never aborts the rest.
#   - Per-repo timeout + overall wall-clock budget prevent SessionStart hangs.
#   - Always exits 0; failures are logged, never propagated.
#   - Idempotent: pulls on re-run, does not re-clone.
#
# ensure_symlink invariant: wisdom skill names (cloudflare-wisdom, test-wisdom,
# etc.) are gitignored on Mac and therefore NOT present in the public
# claude-settings mirror. The cp -a block in setup-web.sh will never create
# them, so the rm -rf inside each repo's setup:doc-skill replaces nothing
# pre-existing from that mirror. (Documents the assumption guarding against a
# future name collision silently destroying a mirrored skill.)

# ── Named constants ────────────────────────────────────────────────────────────
# Adjust these if network or setup times change; keep them conservative.
# Each operation (clone/pull OR setup:doc-skill) is bounded independently.
# Worst case per repo: GIT_TIMEOUT + SETUP_TIMEOUT = 75 + 75 = 150s.
# Five repos at worst: 750s — the OVERALL_BUDGET_SECONDS cap cuts this to 5 min.
GIT_TIMEOUT=75             # seconds for git clone / pull per repo
SETUP_TIMEOUT=75           # seconds for npm run setup:doc-skill per repo
OVERALL_BUDGET_SECONDS=300 # 5-minute wall-clock cap for the entire loop

# ── Guard: web-only ────────────────────────────────────────────────────────────
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# ── Manifest ──────────────────────────────────────────────────────────────────
# Cheap Takazudo/* repos first (priority: test-wisdom / browser skills appear
# soonest). css-wisdom (zudolab) is last and allowed to fail gracefully.
WISDOM_REPOS=(
  "https://github.com/Takazudo/zudo-test-wisdom"
  "https://github.com/Takazudo/zudo-cloudflare-wisdom"
  "https://github.com/Takazudo/zudo-tauri-wisdom"
  "https://github.com/Takazudo/zudo-codemirror-wisdom"
  "https://github.com/zudolab/zudo-css-wisdom"
)

WISDOM_BASE="$HOME/.claude-wisdom"
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$WISDOM_BASE" "$SKILLS_DIR"

# ── Wall-clock start ───────────────────────────────────────────────────────────
LOOP_START=$(date +%s)

# ── Per-repo loop ──────────────────────────────────────────────────────────────
for repo_url in "${WISDOM_REPOS[@]}"; do
  # Check overall budget before starting each repo
  NOW=$(date +%s)
  ELAPSED=$(( NOW - LOOP_START ))
  if [ "$ELAPSED" -ge "$OVERALL_BUDGET_SECONDS" ]; then
    echo "[setup-web-wisdom] Overall budget (${OVERALL_BUDGET_SECONDS}s) exceeded after ${ELAPSED}s — skipping remaining repos"
    break
  fi

  repo_name="$(basename "${repo_url%/}")"
  if [ -z "$repo_name" ]; then
    echo "[setup-web-wisdom] ERROR: could not derive repo name from URL '$repo_url' — skipping"
    continue
  fi
  repo_dir="$WISDOM_BASE/$repo_name"

  echo "[setup-web-wisdom] === $repo_name ==="

  # ── cache-or-pull-clone ──────────────────────────────────────────────────────
  set +e
  if [ -d "$repo_dir/.git" ]; then
    timeout "$GIT_TIMEOUT" git -C "$repo_dir" pull --ff-only --quiet 2>&1
    git_exit=$?
    if [ $git_exit -ne 0 ]; then
      echo "[setup-web-wisdom] WARN: pull failed for $repo_name (exit $git_exit) — using cached clone"
    fi
  else
    timeout "$GIT_TIMEOUT" git clone --depth 1 "$repo_url" "$repo_dir" --quiet 2>&1
    git_exit=$?
    if [ $git_exit -ne 0 ]; then
      echo "[setup-web-wisdom] ERROR: clone failed for $repo_name (exit $git_exit) — skipping"
      set -e
      continue
    fi
  fi
  set -e

  # ── run setup:doc-skill ──────────────────────────────────────────────────────
  # printf '\n' satisfies the `read` skill-name prompt in Takazudo/* repos
  # (accepts the default); it is harmless for css-wisdom which has no prompt.
  # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 prevents headless-browser's postinstall
  # from hitting the CDN (which is blocked in web containers).
  #
  # Note: setup-doc-skill.sh in Takazudo/* repos creates the global skill
  # symlinks (ln -s into ~/.claude/skills/) BEFORE its internal npm install
  # loop, so test-wisdom / verify-ui / headless-browser / verify-ui-ai symlinks
  # are available even if playwright install subsequently fails.
  set +e
  (
    cd "$repo_dir" || exit 1
    timeout "$SETUP_TIMEOUT" bash -c 'printf "\n" | PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run setup:doc-skill' 2>&1
  )
  setup_exit=$?
  set -e

  if [ $setup_exit -ne 0 ]; then
    echo "[setup-web-wisdom] WARN: setup:doc-skill failed for $repo_name (exit $setup_exit) — continuing"
  else
    echo "[setup-web-wisdom] OK: $repo_name"
  fi
done

TOTAL=$(( $(date +%s) - LOOP_START ))
echo "[setup-web-wisdom] Done in ${TOTAL}s. Skills available: $(ls "$SKILLS_DIR" 2>/dev/null | tr '\n' ' ')"

exit 0
