# Child Brief — standing rules for every worktree child

Every `/x-wt-teams` child reads this file first (the spawn prompt points here by absolute path). It replaces the retired `frontend-worktree-child` agent definition; children spawn as `general-purpose`. The spawn prompt (SKILL.md Step 5 items a–k) wins wherever it is more specific.

## Worktree rules

- Stay in your assigned worktree — all file operations and git commands happen there. Your branch is already checked out.
- Commit locally only. Never push, never force push, never open a PR — the manager does that in Step 11.
- Prefer editing existing files over creating new ones; no unsolicited READMEs/docs.

## Testing

- Logic (transforms, utilities, state, hooks): test-first with the project's unit test setup.
- UI that is cheaply testable (rendering, conditional display, props): use the project's existing DOM testing setup.
- UI that is hard to test (drag-and-drop, animation, visual layout): skip unit tests. You must not drive a browser yourself (prompt item f) — commit and report what needs visual verification to the manager.

## Workflow

1. Explore the worktree for existing patterns, implement, commit with clear messages.
2. Self-review in your own turn (next section), fix, commit.
3. Reap this workspace's leaked codex broker — a child session never fires the plugin's SessionEnd hook, so the broker + app-server pair would orphan to PPID 1:
   `node $HOME/.claude/scripts/codex-sweep.js --workspace "<your-worktree-abs-path>"`
   Pass the assigned worktree's absolute path, not `$PWD` (in a team-child session `$PWD` can be the lead's cwd). Quiet no-op when none exists.
4. Rebuild touched workspace packages (below), if applicable.
5. Save a log, then report to the manager via SendMessage.

## Self-review must not park

Every completion notification in this harness routes to the **manager**, not to you — from a backgrounded Bash shell-out, from a nested `Agent` call (which returns an async handle even with `run_in_background: false`), or from a skill that runs as a background subagent. A child that ends its turn "waiting for the review" parks forever: no completion report, merge gate stays shut. Canonical statement: `execution-modes.md` → "Invariant".

- Do **not** invoke `/code-review`, `/deep-review`, or `/codex-review`. Review synchronously yourself: read `git diff <base-branch>...HEAD`, one bugs/logic pass and one quality/structure pass over the changed files, apply clearly-useful fixes, commit.
- If any call hands back a background handle, abandon it — `TaskOutput` is not in your toolset, so there is no way to drain it.
- Report only after the review has actually completed. "Review still running / waiting on a notification" is a parked report, not a completion report.

## Workspace package rebuild

If your commits touched source inside a workspace package that (1) has its own `build` script and (2) is consumed through a built artifact (`exports` / `main` / `module` pointing at `dist/`, `build/`, `lib/`), rebuild it (`pnpm --filter <name> build` or the project's equivalent) and commit the build output if it is tracked. Otherwise the consumer keeps loading stale compiled output. A failed build is a blocker. Defer to the project's `CLAUDE.md` when it names the workspace root or rebuild command.

## Log and report

- Log: `$HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-wt-child-{context}.md" "content"`, then `pnpm dlx @takazudo/mdx-formatter --write <file.md>`. `{logdir}` resolves to the Dropbox-synced cclogs dir; never use `~` in paths.
- Completion report via SendMessage to the manager: self-review ran in the foreground and findings were applied (or none found), final commit SHA, working tree is clean, log file path. Keep it short — detail lives in the log.
- If anything is unclear or blocked, ask the manager via SendMessage with full context.
