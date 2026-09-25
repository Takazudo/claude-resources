# Arguments Reference

Single source of truth for every `/x-wt-teams` flag. The skill body links here instead of duplicating flag docs at every step.

## Argument hint

```
[-co|--codex]
[-a|--auto] [-m|--merge] [-f|-fix|--auto-fix] [-nf|--no-fix] [-lo|--local] [--no-issue] [-s|--stay] [-v|--verify-ui]
[-nor|--no-review]
[-ri|--raise-issues] [-nori|--no-raise-issues]
[#issue-number] <instructions>
```

## Reviewer selection is the only delegation dial

`-co` / `--codex` chooses which reviewer runs at Step 9 (final QA). It does NOT affect child agents or fix-delegation agents. See `reviewer-modes.md`.

There is **no effort level and no team-member model flag** on this skill. Reviewers are invoked bare and use their own defaults; child and fix-delegation agents take their model from the per-topic `/big-plan` `**Model:**` annotation (default `opus`). See `per-topic-models.md`.

## Flag table

| Flag | Aliases | What it does | Conflicts / notes |
|---|---|---|---|
| `-co` | `--codex` | Upgrade Step 9 from `/code-review` to `/deep-review` (`/code-review` **plus** `/codex-review`). Degrades silently to the Claude equivalent if codex is rate-limited or unavailable. See `reviewer-modes.md`. | Adds the codex reviewer rather than replacing the built-in one. |
| `-a` | `--auto` | Auto-chain flag. When Auto-Suggest matches Signal A (Super-Epic child) or Signal B (`--stay` accumulating-epic) with a next wave remaining, invoke the next-wave command immediately via Skill instead of printing-and-stopping; append `-a` (and forward `-m` / `-nf` / `-nori` / `-lo`) so the chain self-runs. Pause and surface to the user only on a blocker. Does **NOT** merge — that's `-m`. | Replaces the retired `-seq` flag. Only meaningful for multi-wave plans (typically `/big-plan` epics); single-session runs are no-ops. Combinable with all other flags. See "`-a` chain mechanism" below. |
| `-m` | `--merge` | Merge mode. After Step 15, run `/prc -c` (wait for CI, merge the root PR, close issue), then invoke `/watch-ci` on the merged target branch; if red, spawn an Opus subagent to fix (max 2 cycles). This was `-a`'s behavior before the `-a`/`-m` split. | **Deferred to chain termination in Super-Epic child mode** — mid-chain sessions carry it only; the terminal sibling merges the **super-PR** into its parent, closes the super-epic issue, and cleans up the super base (see `super-epic-mode.md`). **Deferred mid-chain generally** — in a Signal A/B chain the merge runs only at chain termination; intermediate waves forward `-m` onward. **Limited env (web):** the merge stays CI-gated (never force-merged) but skips the local visual/Mac check, then raises a `mac` issue — see `../../../web/mac-handoff.md` §6-A. |
| `-f` | `-fix`, `--auto-fix` | **Default — on unless `-nf` is passed.** After the main work, before Step 16 cleanup, auto-fix the safe subset of `agent-found` issues raised this session (triage leave-open-vs-fix; tiny fixes bundled into one `agent-fix/<slug>` PR, non-trivial ones each own PR; every fix runs `/code-review low --fix`; close + link on success; cap ~3 rounds). See the "Auto-Fixing Raised Findings" step in `SKILL.md`. | Requires `-ri` (the default); **no-op under `-nori`**. Fix PRs follow the same `-m` auto-merge semantics as the root PR. Independent of `-a` / `-m`. |
| `-nf` | `--no-fix` | Skip the Step 15.5 auto-fix — raised `agent-found` issues stay open for human triage. | Use for careful / manual sessions. Forwarded on `-a` chain waves. |
| `-lo` | `--local` | Local mode: no tracking issue — the spec + progress ledger live in a cclogs coordination dir (`plan.md` / `progress.md` / `sub-NN.md`) instead. Accepts a plan-dir path from `/big-plan --local`. See Step 1c and `local-mode.md`. | `agent-found` problem issues are still raised (use `-nori` to suppress). Keeps the anti-drift ledger, unlike bare `--no-issue`. |
| `-toco` | `--to-codex` | Codex hand-off: do NOT implement here. Open a new tmux window running `codex` at the repo root, stage `$x-wt-teams <flags> <epic# or topics>` in its composer, focus it, and end the session. **Fires at the very start**, before any base branch, worktree, or PR exists. See `codex-handoff.md`. | Forwards `-a` / `-m` / `-nf` / `-nori` / `-lo`; submits only under `-a`. `-co` and `-s` do not travel — the Codex session picks its own. Terminal-only (web has no tmux or local codex). |
| `-tocl` | `--to-claude` | Fresh-Claude hand-off: do NOT implement here. Open a new tmux window running `CLAUDE_CODE_NO_FLICKER=1 claude --dangerously-skip-permissions --model opus` at the repo root, start it on `/x-wt-teams <flags> <epic# or topics>`, focus it, and end the session. Same move as `-toco` to a different destination — a clean context window rather than a different tool (the agent-side stand-in for `/clear`). **Fires at the very start**, before any base branch, worktree, or PR exists. See `handoff-common.md` + `claude-handoff.md`. | **Mutually exclusive with `-toco`** — if both are passed, name the collision and stop. Forwards `-a` / `-m` / `-nf` / `-nori` / `-lo`; submits only under `-a`. `-co` and `-s` do not travel. Plain `/` prefix, not `$` — the target is Claude Code. Terminal-only (web has no tmux or second CLI). |
| `--no-issue` | `-lo`, `--local` | Alias of `--local`. Skip GitHub issue creation; use the cclogs ledger instead. | Retained for back-compat; now identical to `--local` (writes `progress.md`, no longer a pure skip). |
| `-s` | `--stay` | **OPT-IN ONLY.** Reuse the current branch as the base branch (no new `base/<project-name>`). | See "`-s` / `--stay` mechanism" below. NEVER auto-detect — even with an existing PR, even on a topic branch. |
| `-v` | `--verify-ui` | After Step 9, run `/verify-ui` (via the isolated browser subagent). See Step 10. | Requires the isolated-browser dispatch pattern from `resource-coordination.md`. **Limited env (web):** can't run here — Step 10 defers to the `mac`-label handoff (`../../../web/mac-handoff.md`). Also fires when no `-v` but the diff touched UI files. |
| `-nor` | `--no-review` | Skip Step 9 entirely. | Used internally by `/deep-review -t` to prevent infinite recursion when it spawns this skill (paired with `-nf -nori` — `--no-review` alone does NOT skip the Step 15.5 auto-fix or issue-raising defaults). Manual users rarely pass this. |
| `-ri` | `--raise-issues` | **Default — on unless `-nori` is passed.** Raise GitHub issues (with the `agent-found` label) for problems, bugs, or improvement possibilities found in code unrelated to the current task. Pass explicitly for clarity; behavior is identical to the default. | Forwarded to child agents. The label is created on first use via `gh label create ... 2>/dev/null \|\| true` (idempotent). |
| `-nori` | `--no-raise-issues` | Suppress raising GitHub issues for unrelated findings discovered during work. | Forwarded to child agents. Replaces the older `-noi` / `--noi` spellings. |
| `#issue-number` | — | Existing GitHub issue number or URL. Issue body becomes the primary input; reused for progress logging. | If `[Epic]` in title, treat as `/big-plan` epic — see "Epic issue shortcuts" below. |

## Manager invariant

**The manager session is ALWAYS Opus.** No flag downgrades the manager. If invoked on a non-Opus session, note it but proceed.

## Reviewer flag application points

The resolved reviewer selection is applied at:

1. **Step 9 final review** — `/code-review --fix` by default; `/deep-review` when `-co` is passed. Neither is given an effort level. One reviewer tier per run, not a combination (see `reviewer-modes.md`).
2. **Planning 2nd opinion** — `/codex-2nd`, always. It reviews the *plan*, not code, and is unaffected by the reviewer tier.
3. **Child self-review** — child agents read their own diff and review it by hand, regardless of the manager's tier. They invoke no review skill: from a subagent `/code-review` returns a background handle instead of findings and `TaskOutput` isn't available to drain it, so a child that starts one and waits parks.

## Where the child model comes from

There is no flag for it. The model is resolved per topic and applied at:

1. **Child worktree agents** (Step 5) — every `Agent(...)` gets `model:` set from that topic's `/big-plan` `**Model:**` marker, default `opus`. Always set explicitly per spawn (see `per-topic-models.md`).
2. **Fix-delegation agent** — the fresh Agent spawned after Step 9 review to apply fixes in `/x-as-pr`, and the inner `/x-wt-teams --no-review --stay` session spawned by `/deep-review -t`. Default `opus`.

## `-s` / `--stay` mechanism

**Strict opt-in only — never auto-detect.** Always create a new base branch unless the user literally typed `-s` or `--stay`. Even if the current branch has an existing PR, even if it "seems logical" to stay.

When `-s` / `--stay` IS explicitly passed:

- The current branch becomes `BASE_BRANCH` directly (no new branch, and no commit is fabricated to make a PR possible — see the deferred-root-PR rule in `SKILL.md` Rule 4).
- Parent branch (root PR target) is determined **branch-first**, in this order. The absence of a PR is no longer evidence of anything: since the root PR is created in Step 11 rather than Step 2, a base branch with no PR is a legitimate mid-run state.
  1. **Open PR on the branch**: `gh pr view --json baseRefName -q '.baseRefName'`. If one exists, reuse that PR as this run's root PR (record its number) and take its base as the parent.
  2. **Closed or merged PR on the branch** — the common `--stay` round after a merged root PR. Its recorded base is still the right parent.
  3. **A parent recorded by an earlier, interrupted run** on this same base: the orientation pointer note (`orientation.js show`), or the `Base: … → Parent: …` line in the Step 2 progress comment on the tracking issue / `progress.md`.
  4. **A parent the user named** on this invocation.
  5. Only when none of the above answers, fall back to the repo default branch — and say so in the progress comment, because it is a guess, and mis-targeting the root PR is exactly what the ROOT PR TARGET rule at the top of `SKILL.md` prohibits.
- The root PR itself is **not** created here. Step 11 opens it (create-if-absent / adopt-if-present) against the parent resolved above, with the `!! PR TARGET CHECK !!` guard asserting the target at the point of creation.
- Topics branch off `BASE_BRANCH` and merge back into it as usual.
- Everything else (worktrees, child agents, review, push) is identical.

**Typical scenario** — avoiding deep nesting across sequential runs:

1. Round 1: `/x-wt-teams` creates `base/foo-impl` → `main`, work done, PR merged.
2. More tweaks needed, still on `base/foo-impl`.
3. Without `--stay`: would create `base/foo-impl-v2` → `base/foo-impl` → `main` (over-nested).
4. With `--stay`: reuse `base/foo-impl`, topics branch off it, root PR targets `main`.

## `-m` / `--merge` rationale & exceptions

`-m` triggers the following sequence after Step 15 (this was `-a`'s behavior before the `-a`/`-m` split):

1. `/prc -c` — wait for pre-merge CI, merge with `--merge --delete-branch`, close linked issue.
2. `/watch-ci <root-pr-number>` — watch post-merge CI on the merged target branch.
3. If post-merge CI is red: spawn an Opus subagent with the failed run logs to identify the root cause, fix the code, and push. If the direct push is blocked by branch protection, the subagent opens a fix-forward PR instead. After the subagent reports, re-invoke `/watch-ci`. At most 2 fix cycles; after that, stop and report to the user.
4. Dead Branch Cleanup once CI is green.

**Super-Epic child mode — deferred to chain termination, never applied to the epic-PR.** The mandatory epic-PR → super-epic base merge is unconditional in the Super-Epic flow and is NOT what `-m` controls (see `super-epic-mode.md`). Instead `-m` rides the sibling chain and fires in the **terminal sibling** session (no open siblings left): it merges the **super-PR** (`base/<super-slug>` → its recorded parent) after re-checking CI, closes the super-epic issue with a completion comment, watches post-merge CI, and dead-branch-cleans the super base. Without `-m`, the super-PR is left open for `/deep-review -t` + a manual merge.

**Deferred mid-chain.** When Auto-Suggest detects a next wave (Signal A or Signal B), the merge does NOT run on the intermediate wave — the root/epic PR must stay open for later waves to accumulate onto. `-m` is forwarded in the next-wave hand-off / auto-invocation and runs only at chain termination.

After the post-merge CI is confirmed green, the **Dead Branch Cleanup Principle** (Important Rule 26) applies — but its implementation is delegated to `/cleanup-resources` at Step 16 (Rule 27): do NOT hand-roll a `git branch -d` block here; pass the dead branches in the cleanup manifest and let the audit delete them.

## `-a` / `--auto` chain mechanism

Auto-continues a multi-wave plan in the same session so the user does not have to copy-paste each next-wave command. (`-a` replaces the retired `-seq` flag. `-a` itself never merges — merging is `-m`'s job.)

**Trigger** — Auto-Suggest detects Signal A (Super-Epic child session) or Signal B (`--stay` accumulating-epic wave session) AND `-a` is on the current invocation.

**Action**:

1. Build the next-wave command per the matching template (`super-epic-mode.md` for Signal A, `issue-templates.md` for Signal B).
2. Append `-a` to the next-wave flag list so the chain self-perpetuates; forward `-m` / `-nf` / `-nori` / `-lo` if they were on this invocation (auto-fix and issue-raising are defaults — only the opt-outs need forwarding).
3. Print the hand-off block as a record, then immediately invoke the same command via the Skill tool — `Skill skill="x-wt-teams" args="..."`.

**Termination** — natural: a future iteration's auto-suggest finds no remaining siblings (last-epic all-done branch, or no-next-found fallback). The skill prints the all-done message, runs Merge Mode if `-m` rode the chain (Signal B: the root PR; Signal A: the super-PR, per the terminal-sibling sequence in `super-epic-mode.md`), and STOPs normally.

**Pause (soft stop, do NOT auto-invoke)** — print hand-off + a one-line "paused: <reason>" note above it, then STOP so the user can intervene. Triggers:

- CI failed and the 2-cycle subagent fix (Merge Mode) or a single inline fix attempt (pre-merge) did not turn it green.
- The Step 9 reviewer reported issues this session cannot auto-fix (requires user product / schema decision).
- Step 15 found missing requirements this session cannot satisfy without user input.
- Merge conflict on the super-epic base or accumulating-epic base that this session cannot resolve safely.
- Any condition that would normally interrupt a single-session workflow (denied destructive action, missing credential, etc.).

A pause leaves the chain resumable — the printed next-wave command still has `-a` appended, so the user can paste it as-is to keep going after addressing the blocker.

**Combinations**:

- `-a -m` — full hands-off. `-a` chains the waves; `-m` merges at chain termination (`/prc` + post-merge `/watch-ci`). In Super-Epic child mode, `-a` chains through the sibling epics on top of each session's mandatory epic-PR merge, and `-m` fires in the terminal sibling to merge the super-PR — so a `/big-plan -is` sweep bundle runs plan → every epic → super-PR merged with no human in the loop.
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
