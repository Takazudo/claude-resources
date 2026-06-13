# Arguments Reference

Single source of truth for every `/x-wt-teams` flag. The skill body links here instead of duplicating flag docs at every step.

## Argument hint

```
[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot]
[-t-op|--team-opus] [-t-so|--team-sonnet]
[-a|--auto] [-m|--merge] [-f|-fix|--auto-fix] [-nf|--no-fix] [--no-issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui]
[-nor|--no-review]
[-ri|--raise-issues] [-nori|--no-raise-issues]
[#issue-number] <instructions>
```

## Two flag families

Two orthogonal groups govern delegation:

- **Reviewer flags** — `-op` / `-so` / `-haiku` / `-co` / `-gco`. These choose which reviewer(s) run at Step 9 (final QA), in `/light-review` self-checks, and for 2nd-opinions during planning. They do NOT affect child agents or fix-delegation agents. Multiple flags combine (Combined Reviewer Mode — see `reviewer-modes.md`).
- **Team-member flags** — `-t-op` / `-t-so`. These override the model for every spawned child agent (Step 5 worktree teammates) and every fix-delegation agent (Step 9 review-fix delegation, `/x-as-pr` post-review fix agent). Session-wide; overrides per-topic `/big-plan` annotations.

## Flag table

| Flag | Aliases | What it does | Conflicts / notes |
|---|---|---|---|
| `-op` | `--opus` | Run Claude reviewer (`/deep-review` / `/review-loop`) at Opus. | Mutually exclusive with `-so`, `-haiku`. Combinable with `-co` / `-gco`. |
| `-so` | `--sonnet` | Run Claude reviewer at Sonnet. | Mutually exclusive with `-op`, `-haiku`. Combinable with `-co` / `-gco`. |
| `-haiku` | `--haiku` | Run Claude reviewer at Haiku. | Mutually exclusive with `-op`, `-so`. Combinable with `-co` / `-gco`. |
| `-co` | `--codex` | Codex-based reviewer (`/codex-review`) plus codex writer / research tooling. **Default when no reviewer flag is passed** — codex is the house default 2nd agent. Silently falls back to **Opus** (subagent at `model: opus`) if codex is rate-limited or unavailable. See `reviewer-modes.md`. | Combinable with all other reviewer flags. When passed without any Claude model flag, the Claude reviewer is replaced (not added). |
| `-gco` | `--github-copilot` | Add GitHub Copilot CLI reviewer (`/gco-review`, GPT-5.4) plus copilot 2nd-opinion / research. See `reviewer-modes.md`. | Combinable with all other reviewer flags. |
| `-t-op` | `--team-opus` | Force every child agent and fix-delegation agent to Opus. Session-wide override of per-topic `/big-plan` `**Model:**` markers. | Mutually exclusive with `-t-so`. **Manager always runs as Opus regardless.** Default without any team-member flag stays `opus`. |
| `-t-so` | `--team-sonnet` | Force every child agent and fix-delegation agent to Sonnet. Session-wide override. | Mutually exclusive with `-t-op`. There is no `-t-haiku` — haiku is rare enough that it stays opt-in via `/big-plan` per-topic markers only. |
| `-a` | `--auto` | Auto-chain flag. When Auto-Suggest matches Signal A (Super-Epic child) or Signal B (`--stay` accumulating-epic) with a next wave remaining, invoke the next-wave command immediately via Skill instead of printing-and-stopping; append `-a` (and forward `-m` / `-nf` / `-nori`) so the chain self-runs. Pause and surface to the user only on a blocker. Does **NOT** merge — that's `-m`. | Replaces the retired `-seq` flag. Only meaningful for multi-wave plans (typically `/big-plan` epics); single-session runs are no-ops. Combinable with all other flags. See "`-a` chain mechanism" below. |
| `-m` | `--merge` | Merge mode. After Step 15, run `/pr-complete -c` (wait for CI, merge the root PR, close issue), then invoke `/watch-ci` on the merged target branch; if red, spawn an Opus subagent to fix (max 2 cycles). This was `-a`'s behavior before the `-a`/`-m` split. | **Ignored in Super-Epic child mode** (see `super-epic-mode.md`). **Deferred mid-chain** — in a Signal A/B chain the merge runs only at chain termination; intermediate waves forward `-m` onward. |
| `-f` | `-fix`, `--auto-fix` | **Default — on unless `-nf` is passed.** After the main work, before Step 16 cleanup, auto-fix the safe subset of `agent-found` issues raised this session (triage leave-open-vs-fix; tiny fixes bundled into one `agent-fix/<slug>` PR, non-trivial ones each own PR; every fix runs `/light-review`; close + link on success; cap ~3 rounds). See the "Auto-Fixing Raised Findings" step in `SKILL.md`. | Requires `-ri` (the default); **no-op under `-nori`**. Fix PRs follow the same `-m` auto-merge semantics as the root PR. Independent of `-a` / `-m`. |
| `-nf` | `--no-fix` | Skip the Step 15.5 auto-fix — raised `agent-found` issues stay open for human triage. | Use for careful / manual sessions. Forwarded on `-a` chain waves. |
| `--no-issue` | — | Skip GitHub issue creation. All `gh issue comment` calls become no-ops. | Cannot create issue mid-run if missed. |
| `-s` | `--stay` | **OPT-IN ONLY.** Reuse the current branch as the base branch (no new `base/<project-name>`). | See "`-s` / `--stay` mechanism" below. NEVER auto-detect — even with an existing PR, even on a topic branch. |
| `-l` | `--review-loop` | Replace Step 9 `/deep-review` with `/review-loop 5`. | `-nori` is forwarded to the inner `/review-loop` (its deferred needs-consideration findings become `agent-found` issues by default). |
| `-v` | `--verify-ui` | After Step 9, run `/verify-ui` (via the isolated browser subagent). See Step 10. | Requires the isolated-browser dispatch pattern from `resource-coordination.md`. |
| `-nor` | `--no-review` | Skip Step 9 entirely. | Used internally by `/deep-review -t` to prevent infinite recursion when it spawns this skill (paired with `-nf -nori` — `--no-review` alone does NOT skip the Step 15.5 auto-fix or issue-raising defaults). Manual users rarely pass this. |
| `-ri` | `--raise-issues` | **Default — on unless `-nori` is passed.** Raise GitHub issues (with the `agent-found` label) for problems, bugs, or improvement possibilities found in code unrelated to the current task. Pass explicitly for clarity; behavior is identical to the default. | Forwarded to child agents. The label is created on first use via `gh label create ... 2>/dev/null \|\| true` (idempotent). |
| `-nori` | `--no-raise-issues` | Suppress raising GitHub issues for unrelated findings discovered during work. | Forwarded to child agents, and (with `-l`) to the inner `/review-loop` so its deferred findings stay terminal-only. Replaces the older `-noi` / `--noi` spellings. |
| `#issue-number` | — | Existing GitHub issue number or URL. Issue body becomes the primary input; reused for progress logging. | If `[Epic]` in title, treat as `/big-plan` epic — see "Epic issue shortcuts" below. |

## Manager invariant

**The manager session is ALWAYS Opus.** Neither reviewer flags (`-op` / `-so` / `-haiku`) nor team-member flags (`-t-op` / `-t-so`) downgrade the manager. If invoked on a non-Opus session and the user passes any of these flags, note it but proceed.

## Reviewer flag application points

The resolved reviewer flag set is applied at:

1. **Step 9 final review** — `/deep-review` (or `/review-loop`) is invoked with the Claude model flag forwarded. If `-co` / `-gco` are also passed, the corresponding non-Claude reviewers run sequentially on the same base branch and their findings combine (see `reviewer-modes.md`).
2. **Claude-side 2nd opinion** — when no backend flag is active, `/codex-2nd` still runs as a default planning-phase 2nd opinion. When a Claude model flag is passed alongside backend flags, every matching `*-2nd` command runs in sequence.
3. **Child self-review** — child agents run `/light-review` with active backend flags forwarded. The Claude model flag does NOT change `/light-review`'s default unless backend flags are also omitted.

## Team-member flag application points

The resolved team-member flag (`-t-op` / `-t-so`, default `opus`) is applied at:

1. **Child worktree agents** (Step 5) — every `Agent(...)` gets `model:` set to the resolved team model. Always set explicitly per spawn. Overrides per-topic `/big-plan` `**Model:**` markers (see `per-topic-models.md`).
2. **Fix-delegation agent** — the fresh Agent spawned after Step 9 review to apply fixes in `/x-as-pr`, and the inner `/x-wt-teams --no-review --stay` session spawned by `/deep-review -t`.

## Two flag families are orthogonal

Reviewer flags and team-member flags do not interact — pass any combination. Example: `-so -gco -t-op` means "run Claude reviewer at Sonnet AND `/gco-review` for QA, with all child agents on Opus."

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

## `-m` / `--merge` rationale & exceptions

`-m` triggers the following sequence after Step 15 (this was `-a`'s behavior before the `-a`/`-m` split):

1. `/pr-complete -c` — wait for pre-merge CI, merge with `--merge --delete-branch`, close linked issue.
2. `/watch-ci <root-pr-number>` — watch post-merge CI on the merged target branch.
3. If post-merge CI is red: spawn an Opus subagent with the failed run logs to identify the root cause, fix the code, and push. If the direct push is blocked by branch protection, the subagent opens a fix-forward PR instead. After the subagent reports, re-invoke `/watch-ci`. At most 2 fix cycles; after that, stop and report to the user.
4. Dead Branch Cleanup once CI is green.

**Ignored in Super-Epic child mode.** The mandatory epic-PR → super-epic base merge is already part of the Super-Epic flow (see `super-epic-mode.md`). `-m` would be confusing — a user might read it as "also merge the super-epic base into main," which this skill never does. Treat as no-op in Super-Epic mode.

**Deferred mid-chain.** When Auto-Suggest detects a next wave (Signal A or Signal B), the merge does NOT run on the intermediate wave — the root/epic PR must stay open for later waves to accumulate onto. `-m` is forwarded in the next-wave hand-off / auto-invocation and runs only at chain termination.

After the post-merge CI is confirmed green (non-Super-Epic), the **Dead Branch Cleanup Principle** (Important Rule 26) applies — but its implementation is delegated to `/cleanup-resources` at Step 16 (Rule 27): do NOT hand-roll a `git branch -d` block here; pass the dead branches in the cleanup manifest and let the audit delete them.

## `-a` / `--auto` chain mechanism

Auto-continues a multi-wave plan in the same session so the user does not have to copy-paste each next-wave command. (`-a` replaces the retired `-seq` flag. `-a` itself never merges — merging is `-m`'s job.)

**Trigger** — Auto-Suggest detects Signal A (Super-Epic child session) or Signal B (`--stay` accumulating-epic wave session) AND `-a` is on the current invocation.

**Action**:

1. Build the next-wave command per the matching template (`super-epic-mode.md` for Signal A, `issue-templates.md` for Signal B).
2. Append `-a` to the next-wave flag list so the chain self-perpetuates; forward `-m` / `-nf` / `-nori` if they were on this invocation (auto-fix and issue-raising are defaults — only the opt-outs need forwarding).
3. Print the hand-off block as a record, then immediately invoke the same command via the Skill tool — `Skill skill="x-wt-teams" args="..."`.

**Termination** — natural: a future iteration's auto-suggest finds no remaining siblings (last-epic all-done branch, or no-next-found fallback). The skill prints the all-done message, runs Merge Mode if `-m` rode the chain (non-Super-Epic only), and STOPs normally.

**Pause (soft stop, do NOT auto-invoke)** — print hand-off + a one-line "paused: <reason>" note above it, then STOP so the user can intervene. Triggers:

- CI failed and the 2-cycle subagent fix (Merge Mode) or a single inline fix attempt (pre-merge) did not turn it green.
- `/deep-review` or `/review-loop` reported issues this session cannot auto-fix (requires user product / schema decision).
- Step 15 found missing requirements this session cannot satisfy without user input.
- Merge conflict on the super-epic base or accumulating-epic base that this session cannot resolve safely.
- Any condition that would normally interrupt a single-session workflow (denied destructive action, missing credential, etc.).

A pause leaves the chain resumable — the printed next-wave command still has `-a` appended, so the user can paste it as-is to keep going after addressing the blocker.

**Combinations**:

- `-a -m` — full hands-off. `-a` chains the waves; `-m` merges the root/epic PR at chain termination (`/pr-complete` + post-merge `/watch-ci`). In Super-Epic child mode, `-m` is ignored (existing rule); `-a` still chains through the sibling epics on top of the mandatory epic-PR merge.
- `-a -s` — typical accumulating-epic chain (`-s` reuses the epic base, `-a` advances through sub-issues).
- `-a` alone — chains waves but leaves the final PR ready-but-unmerged. Only meaningful when the input is a `/big-plan` epic; otherwise no signal will fire and the chain part is a no-op.

## `--no-review` rationale

The flag exists for one purpose: when `/deep-review -t` (default team-fix mode) spawns a child `/x-wt-teams --no-review --stay` to apply review fixes, the child must NOT run its own `/deep-review` again — that would loop forever (`/deep-review -t` → `/x-wt-teams` → `/deep-review -t` → …). `/deep-review` passes `-nf -nori` alongside it: `--no-review` only skips Step 9, so without the opt-outs the contained fix session would still run the default Step 15.5 auto-fix (opening fix PRs the outer session never tracks) and raise its own `agent-found` issues (a second raise-owner). Manual users almost never pass this.

## Epic issue shortcuts

If a `#issue-number` is provided AND the issue title contains `[Epic]`:

- Topics, base branch name, and dependency order come from the issue body — do NOT re-plan.
- Skip the `/codex-2nd` planning-phase second opinion (already done by `/big-plan`).
- Claim the epic by commenting on it before Step 2.

If the epic body also contains `**Super-epic:** #N` markers, this is a **Super-Epic child session** — see `super-epic-mode.md` for the full set of overrides (parent branch is the super-epic base, root PR target changes, mandatory epic-PR merge, etc.).
