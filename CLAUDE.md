# Global Instructions

## Tools & Runtime

- Check the project's package manager (pnpm, npm, etc.) before running install or script commands
- `gh` CLI for GitHub operations (PRs, issues, API)

## Code Style

- Prefer kebab-case for file names to avoid case-sensitivity issues, unless the project uses a different convention

## Git Safety

- No force push, no `--amend` unless explicitly permitted
- No branch name reuse. Regular merge by default (not squash)

## CSS Coding

- Before writing non-trivial CSS, invoke `/css-wisdom <topic>` to look up best practices
- This covers: layout, typography, spacing, color, shadows, responsive, transitions, modern CSS

## Dropbox

Screenshots directory path is available as `$DROPBOX_SCREENSHOTS_DIR` env var (set in $HOME/.zshrc).

## Testing & Verification

- Unit tests alone cannot prove visual correctness. If the change is UI/CSS/layout, verify with `/verify-ui` (computed styles) or `/headless-browser` (screenshots, interactions)
- When user says "it's still broken" after you tested, escalate to a deeper testing level -- do not re-run the same test
- Invoke `/test-wisdom` when unsure which testing approach fits the current situation
- **NEVER suggest "clear browser cache" or "hard refresh" as a solution.** If the user says it's still broken, the code is still broken. Investigate the actual cause instead of blaming cache.

## Safety

- `rm -rf`: relative paths only (`./path`, never `/absolute/path`)
- Agent logs/artifacts go to `$HOME/cclogs/{repo-name}/` via save-file.js `{logdir}` placeholder. NEVER use `~` in file paths — `~` is NOT expanded in Node.js or non-login shell contexts. Always use `$HOME` or the `{logdir}` placeholder
- Worktree prompt files and truly ephemeral temp files stay in `__inbox/` (gitignored)

