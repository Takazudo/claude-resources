# Arguments Reference

Single source of truth for every `/x-wt-teams` flag. The skill body links here instead of duplicating flag docs at every step.

## Argument hint

```
[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap]
[-a|--auto] [--no-issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui]
[-seq|--sequentially] [-nor|--no-review] [--noi] [-noi|--no-raise-issues]
[#issue-number] <instructions>
```

## Flag table

| Flag | Aliases | What it does | Conflicts / notes |
|---|---|---|---|
| `-haiku` | `--haiku` | Claude model for **child agents** (Step 5) and Claude reviewers (2nd opinion / Step 9 final review). | Mutually exclusive with `-so`, `-op`. **Manager always runs as Opus regardless.** |
| `-so` | `--sonnet` | Same as above, Sonnet. | Mutually exclusive with `-haiku`, `-op`. |
| `-op` | `--opus` | Same as above, Opus. **Default.** | Mutually exclusive with `-haiku`, `-so`. |
| `-co` | `--codex` | Use codex-based reviewers / writer / research throughout. See `reviewer-modes.md`. | Combinable with `-gco`, `-gcoc`. |
| `-gco` | `--github-copilot` | Use GitHub Copilot CLI reviewers / 2nd opinion / research. See `reviewer-modes.md`. | Combinable with `-co`, `-gcoc`. |
| `-gcoc` | `--github-copilot-cheap` | Like `-gco` but forces free `gpt-4.1` model. See `reviewer-modes.md`. | Combinable with `-co`, `-gco`. |
| `-a` | `--auto` | After Step 15, run `/pr-complete -c` (wait for CI, merge, close issue), then invoke `/watch-ci` on the merged target branch; if red, spawn an Opus subagent to fix (max 2 cycles). | **Ignored in Super-Epic child mode** (see `super-epic-mode.md`). Treat as no-op there. |
| `--no-issue` | — | Skip GitHub issue creation. All `gh issue comment` calls become no-ops. | Cannot create issue mid-run if missed. |
| `-s` | `--stay` | **OPT-IN ONLY.** Reuse the current branch as the base branch (no new `base/<project-name>`). | See "`-s` / `--stay` mechanism" below. NEVER auto-detect — even with an existing PR, even on a topic branch. |
| `-l` | `--review-loop` | Replace Step 9 `/deep-review` with `/review-loop 5 --aggressive --issues`. | `--issues` dropped if `--noi` is also passed. |
| `-v` | `--verify-ui` | After Step 9, run `/verify-ui` (via the isolated browser subagent). See Step 10. | Requires the isolated-browser dispatch pattern from `resource-coordination.md`. |
| `-seq` | `--sequentially` | Multi-wave auto-continue. When Auto-Suggest matches Signal A (Super-Epic child) or Signal B (`--stay` accumulating-epic), invoke the next-wave command immediately via Skill instead of printing-and-stopping. Forward `-seq` to subsequent waves so the chain self-runs. Pause and surface to user only on a blocker. | Only meaningful for multi-wave plans (typically `/big-plan` epics). Single-session runs are no-ops. Combinable with all other flags. See "`-seq` mechanism" below. |
| `-nor` | `--no-review` | Skip Step 9 entirely. | Used internally by `/deep-review -t` to prevent infinite recursion when it spawns this skill. Manual users rarely pass this. |
| `--noi` | `--noissue`, `--noissues` | With `--review-loop`: drop `--issues` from the inner `/review-loop` invocation. | Only meaningful with `-l` / `--review-loop`. **Different from `-noi`** — see next row. |
| `-noi` | `--no-raise-issues` | Suppress raising GitHub issues for unrelated findings discovered during work. | Forwarded to child agents. Different from `--noi` (review-loop one). |
| `#issue-number` | — | Existing GitHub issue number or URL. Issue body becomes the primary input; reused for progress logging. | If `[Epic]` in title, treat as `/big-plan` epic — see "Epic issue shortcuts" below. |

## Manager invariant & model delegation

**The manager session is ALWAYS Opus.** Model flags (`-haiku` / `-so` / `-op`) do NOT downgrade the manager. If invoked on a non-Opus session and the user passes a model flag, note it but proceed.

The resolved model flag IS applied at:

1. **Child worktree agents** (Step 5) — every `Agent(...)` gets `model:` set to the resolved Claude model (default `opus`). Always set explicitly.
2. **Claude-side 2nd opinion** — if not using `/codex-2nd` or `/gco-2nd`, spawn at the resolved model.
3. **Step 9 final review** — `/deep-review` (or `/review-loop`) is invoked with the same model/backend flags forwarded.
4. **Child self-review** — child agents run `/light-review` with active backend flags. The model flag does NOT force Claude reviewers here unless backend flags are also omitted.

Model flags are **orthogonal** to `-co` / `-gco` / `-gcoc` and can coexist with any of them.

## `-s` / `--stay` mechanism

**Strict opt-in only — never auto-detect.** Always create a new base branch unless the user literally typed `-s` or `--stay`. Even if the current branch has an existing PR, even if it "seems logical" to stay.

When `-s` / `--stay` IS explicitly passed:

- The current branch becomes `BASE_BRANCH` directly (no new branch, no empty commit).
- Parent branch (root PR target) is determined by:
  1. Check existing PR: `gh pr view --json baseRefName -q '.baseRefName'`
  2. If yes, reuse that PR (record number) and use its base as parent.
  3. If no PR, use repo default branch as parent and create a new root PR.
- Topics branch off `BASE_BRANCH` and merge back into it as usual.
- Everything else (worktrees, child agents, review, push) is identical.

**Typical scenario** — avoiding deep nesting across sequential runs:

1. Round 1: `/x-wt-teams` creates `base/foo-impl` → `main`, work done, PR merged.
2. More tweaks needed, still on `base/foo-impl`.
3. Without `--stay`: would create `base/foo-impl-v2` → `base/foo-impl` → `main` (over-nested).
4. With `--stay`: reuse `base/foo-impl`, topics branch off it, root PR targets `main`.

## `-a` / `--auto` rationale & exceptions

`-a` triggers the following sequence after Step 15:

1. `/pr-complete -c` — wait for pre-merge CI, merge with `--merge --delete-branch`, close linked issue.
2. `/watch-ci <root-pr-number>` — watch post-merge CI on the merged target branch.
3. If post-merge CI is red: spawn an Opus subagent with the failed run logs to identify the root cause, fix the code, and push. If the direct push is blocked by branch protection, the subagent opens a fix-forward PR instead. After the subagent reports, re-invoke `/watch-ci`. At most 2 fix cycles; after that, stop and report to the user.
4. Dead Branch Cleanup once CI is green.

**Ignored in Super-Epic child mode.** The mandatory epic-PR → super-epic base merge is already part of the Super-Epic flow (see `super-epic-mode.md`). `-a` would be confusing — a user might read it as "also merge the super-epic base into main," which this skill never does. Treat as no-op in Super-Epic mode.

After the post-merge CI is confirmed green (non-Super-Epic), apply the **Dead Branch Cleanup Principle** (Important Rule 23): checkout target branch, pull, `git branch -d` the now-dead local source branch. Use `-d` not `-D`.

## `-seq` / `--sequentially` mechanism

Auto-continues a multi-wave plan in the same session so the user does not have to copy-paste each next-wave command.

**Trigger** — Auto-Suggest detects Signal A (Super-Epic child session) or Signal B (`--stay` accumulating-epic wave session) AND `-seq` is on the current invocation.

**Action**:

1. Build the next-wave command per the matching template (`super-epic-mode.md` for Signal A, `issue-templates.md` for Signal B).
2. Append `-seq` to the next-wave flag list so the chain self-perpetuates.
3. Print the hand-off block as a record, then immediately invoke the same command via the Skill tool — `Skill skill="x-wt-teams" args="..."`.

**Termination** — natural: a future iteration's auto-suggest finds no remaining siblings (last-epic all-done branch, or no-next-found fallback). The skill prints the all-done message and STOPs normally.

**Pause (soft stop, do NOT auto-invoke)** — print hand-off + a one-line "paused: <reason>" note above it, then STOP so the user can intervene. Triggers:

- CI failed and the 2-cycle subagent fix (Auto-Complete Mode) or a single inline fix attempt (pre-merge) did not turn it green.
- `/deep-review` or `/review-loop` reported issues this session cannot auto-fix (requires user product / schema decision).
- Step 15 found missing requirements this session cannot satisfy without user input.
- Merge conflict on the super-epic base or accumulating-epic base that this session cannot resolve safely.
- Any condition that would normally interrupt a single-session workflow (denied destructive action, missing credential, etc.).

A pause leaves the chain resumable — the printed next-wave command still has `-seq` appended, so the user can paste it as-is to keep going after addressing the blocker.

**Combinations**:

- `-seq -a` — both apply non-Super-Epic. `-a` runs `/pr-complete` to merge the wave's root PR; `-seq` then invokes the next wave. In Super-Epic child mode, `-a` is ignored (existing rule); `-seq` still applies on top of the mandatory epic-PR merge.
- `-seq -s` — typical accumulating-epic chain (`-s` reuses the epic base, `-seq` advances through sub-issues).
- `-seq` alone — only meaningful when the input is a `/big-plan` epic; otherwise no signal will fire and `-seq` is a no-op.

## `--no-review` rationale

The flag exists for one purpose: when `/deep-review -t` (default team-fix mode) spawns a child `/x-wt-teams --no-review --stay` to apply review fixes, the child must NOT run its own `/deep-review` again — that would loop forever (`/deep-review -t` → `/x-wt-teams` → `/deep-review -t` → …). Manual users almost never pass this.

## Epic issue shortcuts

If a `#issue-number` is provided AND the issue title contains `[Epic]`:

- Topics, base branch name, and dependency order come from the issue body — do NOT re-plan.
- Skip the `/codex-2nd` planning-phase second opinion (already done by `/big-plan`).
- Claim the epic by commenting on it before Step 2.

If the epic body also contains `**Super-epic:** #N` markers, this is a **Super-Epic child session** — see `super-epic-mode.md` for the full set of overrides (parent branch is the super-epic base, root PR target changes, mandatory epic-PR merge, etc.).
