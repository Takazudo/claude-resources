# Repo Scaffold — worktree push guard (`wt-dev`)

One-time, per-repo setup that mechanically blocks pushes from `worktrees/` instead of relying on prompt instructions. Run when the user asks to "scaffold wt-dev", "install the worktree push guard", or "set up x-wt-teams here". Formerly the `/dev-scaffold-wt-dev` skill. Nothing here is committed — the user commits when ready.

Four coupled pieces — install all of them, not a subset:

- `scripts/hooks/pre-push` + `scripts/install-git-hooks.sh` (copied from `assets/wt-dev/scripts/`, repo-agnostic, keep executable bits). The installer writes `.git/hooks/pre-push` idempotently.
- `lefthook.yml` for pre-commit hooks.
- `package.json` scripts: `"prepare": "lefthook install && bash scripts/install-git-hooks.sh"`, `"init-worktree": "bash scripts/install-git-hooks.sh"`, plus `lefthook` as a dev dependency (`pnpm add -Dw lefthook` or the repo's package manager equivalent).
- Root `CLAUDE.md` section from `assets/wt-dev/claude-md-section.md` — substitute `<INSTALL_COMMAND>` and `<INIT_WORKTREE_COMMAND>` for the repo's package manager; skip if `Worktree push policy` is already present. Also ensure `worktrees/` is in `.gitignore`.

## Gotchas

- **The pre-push guard is deliberately NOT in `lefthook.yml`.** lefthook reads config from the worktree's toplevel and would silently skip the guard when invoked from inside a worktree. Never add a `pre-push` block to lefthook for this.
- **`core.hooksPath` set (e.g. `.husky/_`) disables everything** — neither lefthook nor the guard fires. Remove the `hooksPath` line from `.git/config` by hand (`git config` is hard-denied in this setup). A Husky `prepare` script gets replaced (remove `.husky/`, tell the user); any other existing `prepare` gets `&& lefthook install && bash scripts/install-git-hooks.sh` appended.
- **Do not default-include `lint-staged` in `lefthook.yml`.** Without a lint-staged config it fails every commit. Wire `run: pnpm dlx lint-staged` only when the repo already configures lint-staged; otherwise create `pre-commit: { commands: {} }`. Leave an existing `pre-commit` block untouched.
- **Pre-existing `.git/hooks/pre-push` without our marker:** ask, then move it aside to `.git/hooks/pre-push.bak` before running the installer.
- **No `package.json`:** skip the scripts/lefthook wiring; the installer is run by hand.
- Detection is `GIT_DIR != GIT_COMMON_DIR` (any linked worktree), so worktree location doesn't matter to the hook — only the CLAUDE.md text assumes `worktrees/`.

## Verify

Run `bash scripts/install-git-hooks.sh` (expects `install-git-hooks: installed .../.git/hooks/pre-push`), then prove the block with a throwaway worktree:

```bash
git worktree add worktrees/_pushguard-poc -b _pushguard-poc
cd worktrees/_pushguard-poc && git commit --allow-empty -m "test"
git push origin _pushguard-poc   # expected: "Push blocked — you are in a /x-wt-teams worktree." + non-zero exit
cd ../.. && git worktree remove worktrees/_pushguard-poc && git branch -D _pushguard-poc
```

If the push is not blocked: is `.git/hooks/pre-push` present and executable, is `core.hooksPath` unset, and do `git rev-parse --git-dir` / `--git-common-dir` differ inside the worktree?
