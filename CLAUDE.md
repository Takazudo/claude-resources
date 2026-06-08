# Global Instructions

## Tools & Runtime

- Check the project's package manager (pnpm, npm, etc.) before running install or script commands
- `gh` CLI for GitHub operations (PRs, issues, API)

## Code Style

- Prefer kebab-case for file names to avoid case-sensitivity issues, unless the project uses a different convention

## Code Comments — Capture Hidden Spec/Context

- Default is **no comments** — well-named identifiers should explain what the code does.
- Exception: when code embeds knowledge that lives **outside the codebase** — a product spec, an external API contract, a magic value imposed by a partner service, an undocumented platform quirk — leave a short comment. A future reader cannot recover this context by reading more code, and the source-of-truth document may be scattered, behind a login, or nowhere written down.
- Concrete case: a frontend payload field like `bdidso: 10` is opaque on its own. Even if a spec exists somewhere, the next reader has no idea where to look. A one-liner — `// product-specific param required by API X; value is fixed by spec` — saves them from a fruitless search.
- Test before adding: *"If I delete this comment, can a reasonable reader recover the meaning from code, identifiers, or obvious docs?"* If no, the comment earns its place.
- Keep it to a single line of **why** / **where it comes from** — not a tutorial, not a re-statement of what the code already says.

## Git Safety

- No force push, no `--amend` unless explicitly permitted
- No branch name reuse. Regular merge by default (not squash)

## Git Commit/Push -- token-optimized /commits

- `/commits` delegates to a Haiku subagent so the main Opus context only sees a summary, not the full git diff / staging reasoning.
- Direct execution is the last-resort fallback if the subagent fails.
- The old Copilot CLI (`gcom`/`gpush`) path was removed — too fragile for multi-turn stateful git work (see claude-settings#29).

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

## GitHub Issues

- When reading a GitHub issue (URL, issue number, or any reference), always use `/gh-fetch-issue` first. This downloads the issue content and all attached images locally so Claude can read them. Do not use `gh issue view` directly — it cannot access embedded images.
- When creating a GitHub issue that needs images (screenshots, diagrams, etc.), use `/gh-issue-with-imgs` to upload images as release assets and embed them in the issue body. `gh issue create` cannot attach images natively.

## Safety

- `rm -rf`: relative paths only (`./path`, never `/absolute/path`)
- Agent logs/artifacts go to the repo-scoped cclogs dir via save-file.js `{logdir}` placeholder. cclogs is **Dropbox-synced** (`$DROPBOX_CCLOGS_DIR`, set in `.zshrc` for Mac + WSL) so logs/prototypes/artifacts survive switching machines; `~/cclogs` still works as a symlink to it, and `{logdir}` / `get-logdir.js` resolve it. NEVER use `~` in file paths — `~` is NOT expanded in Node.js or non-login shell contexts. Always use `$HOME` or the `{logdir}` placeholder
- WIP / testing / prototype / worktree-prompt files go in the repo-scoped cclogs dir (`$DROPBOX_CCLOGS_DIR/{repo-name}/`), NOT `__inbox/` — the `__inbox/` convention is retired (it was machine-local; cclogs is Dropbox-synced). Existing `__inbox/` files may stay; just don't create new ones. Exception: a prototype that must import the repo's production code or use its workspace/Vite tooling stays in `__inbox/` (in-repo, gitignored) so relative imports and tooling resolve (see `/prototype-first-wisdom`)
