---
name: review-loop
description: "Iterative code review loop running /deep-review multiple times, fixing issues each round. Each round: review (safe fixes applied inline by the reviewer) → big-but-decidable findings are fix-planned, implemented, and merged back via an in-session /big-plan -m -a chain → next round reviews the improved code. Only findings needing a genuine human decision are deferred into GitHub issues (-nori to suppress). Use when: (1) User says 'review-loop', 'review loop', or 'review repeat', (2) User wants continuous review+fix cycles, (3) User wants autonomous review → fix → improve passes before finalizing code, (4) User says 'review 5 rounds' or similar."
user-invocable: true
argument-hint: "[count] [--stay|--as-pr] [-ri|--raise-issues] [-nori|--no-raise-issues] [-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot]"
---

# Review Loop

Run a reviewer skill repeatedly, fixing issues each round. Progressively kills bugs, improves code quality, and **implements** improvement opportunities instead of just filing them.

**review-loop is a thin orchestrator: it does NOT apply fixes itself.** Each round has two fix vehicles, and review-loop only routes between them:

1. The reviewer skill (`/deep-review -nt`, or a standalone backend) reviews **and** fixes safe findings **and** commits in a single pass.
2. Findings the reviewer reported but didn't fix because they're *big* go into an in-session `/big-plan -m -a` chain (plan → issues → implementation → merge back into the workspace branch) before the next round starts.

review-loop's jobs: pick the workspace (Step 1), run N rounds, route unfixed findings (big → `/big-plan`, decision-needing → deferred), and stop early when a round comes back clean.

**Fix policy (fixed — there is no aggressiveness dial).** Every finding lands in exactly one of three buckets:

- **Fix in-round** — clearly harmful (real bug, broken behavior, security hole) and the fix is safe and contained. The reviewer fixes and commits it in that round.
- **Plan-and-implement (Step 2c)** — not fixed in-round only because it's *big*: a large refactor, a multi-file change, a complex-but-well-defined fix. No human preference is required — the right outcome is derivable from the code and the finding. Routed into this round's `/big-plan -m -a` chain, implemented, and merged back before the next round.
- **Defer** — genuinely needs a human decision: product/design preference, scope call, a behavior/API/schema choice the user must own. Collected across rounds and raised as GitHub issues at the end (Step 3); `-nori` keeps them terminal-only.

The bucket test for an unfixed finding: *could a competent engineer implement this without asking anyone's preference?* Yes → plan-and-implement. No → defer. **Size is never a reason to defer** — the failure mode this policy exists to fix is the loop filing every "big" finding as an issue and the app never actually improving.

## Input Parsing

Parse arguments to extract:

- **count** (number): How many review rounds. Default: 2
- **(default, no `--stay`/`--as-pr`)**: Auto-detect from PR presence — if the current branch already has a PR, review **in place**; if it has no PR, create a review branch + draft PR to the current branch and review **there** (see Step 1).
- **--stay**: Force in-place — review and commit fixes directly on the current branch, even if it has no PR. (On the default branch this commits straight to `main`.)
- **--as-pr**: Force the review-PR flow — create a review branch + draft PR even when the current branch already has a PR.
- **-ri** / **--raise-issues** (default — on unless `-nori` is passed): At the end of the loop, raise a GitHub issue (label `agent-found`) for each deferred finding — one that needs a genuine human decision (big-but-decidable findings are implemented via Step 2c, not deferred). Pass explicitly for clarity; behavior is identical to the default.
- **-nori** / **--no-raise-issues**: Don't create GitHub issues for deferred findings — list them in the final report only. Also forwarded to each round's `/big-plan` chain so the whole loop stays terminal-only.
- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Set the Claude model used when Claude reviewers run. Pick at most one. When reviewers run at a model, the default is `-op` (matches `/deep-review`). With no flags at all the round uses `/codex-review`; Review-PR mode forces `-op` if none is given (full-project scan needs it).
- **-co** or **--codex**: Add the OpenAI Codex reviewer. Codex review uses OpenAI Codex CLI for higher-quality reviews. If codex is rate-limited or unavailable, it silently falls back to **Opus** — so `-co` always means "the better reviewer."
- **-gco** or **--github-copilot**: Add the GitHub Copilot CLI reviewer (GPT-5.4).

**Backend routing — combine vs. replace (this is why `-op -co` means "opus AND codex").** A backend flag's behavior depends on whether a model flag is also present, mirroring `/deep-review`'s own augment semantics:

- **Model flag + backend flag(s)** (e.g. `-op -co`): forward everything to `/deep-review -nt`, which runs the Claude reviewers at that model **alongside** the requested backend(s) in parallel and fixes inline. This is the path that gives "opus + codex."
- **Backend flag alone, no model flag** (e.g. just `-co`): run that backend **instead of** Claude reviewers — invoke the standalone `/codex-review` / `/gco-review` (codex-only, Opus as rate-limit fallback). This is the "just give me codex" shortcut.
- **No flags at all**: `/codex-review` directly — the same reviewer `/deep-review` defaults to.

`/deep-review -nt` accepts multiple backend flags at once, so `-op -co -gco` runs Opus reviewers + codex + Copilot in parallel. The standalone-skill path (backend flag alone) takes a single backend.

These flags shape the **review rounds only** — the per-round `/big-plan` chain (Step 2c) always runs `-m -a -pc` (plus `-nori` when passed) with its own default plan reviewer.

## Workflow

### Step 1: Resolve Working Mode and Set Up the Workspace

The review is anchored to the **currently checked-out branch**, never assumed to be `main` (same principle as `/big-plan` and `/x-wt-teams`). First record the branch and whether it already has a PR:

```bash
ORIG_BRANCH=$(git branch --show-current)
DEFAULT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
PR_BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)   # empty if the current branch has no PR
```

Pick the mode (precedence: `--stay` and `--as-pr` are explicit overrides; otherwise auto-detect from PR presence):

| Condition                                            | Mode                  |
| ---------------------------------------------------- | --------------------- |
| `--stay` passed                                      | **In-place**          |
| `--as-pr` passed                                     | **Review-PR**         |
| no flag, current branch **has** a PR (`$PR_BASE` set) | **In-place**          |
| no flag, current branch has **no** PR                | **Review-PR**         |

#### In-place mode

Review and fix directly on the current branch. The diff base is the PR base if one exists, else the repo default branch:

```bash
BASE="${PR_BASE:-$DEFAULT_BRANCH}"
```

Report: "Reviewing branch `$ORIG_BRANCH` against `$BASE` (in place)". Fixes are committed to `$ORIG_BRANCH`. (Note: `--stay` on the default branch commits fixes straight to `main` — use Review-PR mode if you want them isolated.)

#### Review-PR mode

The current branch has no PR (or `--as-pr` forced it), so instead of touching the current branch, stand up a dedicated review PR and run the loop there. This keeps fixes off `main` / off the unreviewed branch and gives them a reviewable home:

```bash
# The PR's base must exist on the remote, so publish the original branch first.
# (This pushes the branch's local commits — required to open a PR targeting it.)
git push -u origin "$ORIG_BRANCH"

REVIEW_BRANCH="review/${ORIG_BRANCH}-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$REVIEW_BRANCH"
git commit --allow-empty -m "chore: start review-loop for ${ORIG_BRANCH} [skip ci]"
git push -u origin "$REVIEW_BRANCH"
gh pr create --draft --base "$ORIG_BRANCH" --head "$REVIEW_BRANCH" \
  --title "Review loop: ${ORIG_BRANCH}" \
  --body "Automated /review-loop fixes targeting \`${ORIG_BRANCH}\`. Each round's fixes are committed here."
PR_NUM=$(gh pr view --json number -q '.number')
```

All subsequent rounds run on `$REVIEW_BRANCH`. Its diff against the PR base (`$ORIG_BRANCH`) is **empty** (only the start commit), so the review is a **full-project scan**, not a branch diff — see the model-flag requirement in Step 2a. Report: "No PR on `$ORIG_BRANCH` — created review branch `$REVIEW_BRANCH` with draft PR #`$PR_NUM` → `$ORIG_BRANCH`; running a full-project review there."

#### Either mode — record the workspace branch

```bash
WORK_BRANCH="$ORIG_BRANCH"      # in-place mode
WORK_BRANCH="$REVIEW_BRANCH"    # review-PR mode
```

Every round reviews on `$WORK_BRANCH`, and each round's `/big-plan -m -a` chain uses it as the parent branch — that is what makes the chain's merge land the fixes back here.

### Step 2: Review Loop (repeat N times)

Each round: run the reviewer (2a) → report and route findings (2b) → plan-and-implement the big findings (2c) → early-exit check (2d). review-loop never applies fixes itself.

#### 2a: Run the reviewer

Start every round from a current workspace branch — the previous round's `/big-plan` chain merged commits to the remote and may have left HEAD elsewhere:

```bash
git checkout "$WORK_BRANCH" && git pull
```

review-loop applies no fixes of its own — it invokes one reviewer skill that reviews + fixes + commits. Always pass `-nt` to `/deep-review` so the reviewer fixes **inline** — when `/x-wt-teams` runs in this loop, it runs inside the Step 2c `/big-plan` chain (planned, issue-backed, merged back), never as the reviewer's own raw fix-team spawn.

**Branch on the Step 1 mode first** (this ordering matters — the no-flag path below would review an empty diff in Review-PR mode):

**Review-PR mode** — the review branch's diff is empty, so the diff-only reviewers (`/codex-review` / `/gco-review`) would find **nothing**; only `/deep-review`'s full-project mode (Mode B) does. So always invoke `/deep-review -nt -nori` **with a model flag**, defaulting to `-op` when the user passed none, and forward any backend flags (`-nori` because review-loop owns the issue-raising — Step 3 raises the deduped deferred list once, instead of each round's `/deep-review` raising its own):

```
Skill(skill="deep-review", args="-nt -nori -op [-co|-gco if passed]")
```

**In-place mode** — route by flags:

- **Model flag present** (with or without backend flags): `Skill(skill="deep-review", args="-nt -nori -op -co")` (forward the model flag + every backend flag, plus `-nt -nori` — review-loop raises the deduped deferred findings itself at Step 3, so the inner `/deep-review` must not raise per-round). Claude reviewers run alongside any backends in parallel, fix and commit inline, scoped to the branch diff (`$BASE...HEAD`).
- **Backend flag alone** (no model flag): invoke the standalone backend — `/codex-review` (`-co`), `/gco-review` (`-gco`). Each reviews, fixes, and commits on its own (verified: both have Apply-Fixes + Commit steps), falling back to Claude reviewers if its backend is rate-limited.
- **No flags**: invoke `/codex-review` — the same reviewer `/deep-review` defaults to, called directly so it reviews + fixes + commits in one clean pass.

Wait for the reviewer to complete (it has already committed this round's safe fixes). Then push, so the remote is current before the Step 2c chain runs:

```bash
git push -u origin "$WORK_BRANCH"
```

The chain merges its root PR on the **remote** — if the inline fixes exist only locally, the chain plans against stale code and the next round's `git pull` becomes a conflict-prone merge instead of a fast-forward.

#### 2b: Report round results and route unfixed findings

Tell the user what was found and fixed in this round. Be concise.

Sort every finding the reviewer reported but did **not** fix into a bucket (see Fix policy): **plan-and-implement** (big but decidable — goes into this round's Step 2c input) or **defer** (needs a genuine human decision — goes onto the running deferred list). Apply the bucket test; when in doubt, plan-and-implement — deferring is reserved for findings only a human can settle.

Dedupe before routing: drop findings an earlier round's chain already implemented, and findings already on the deferred list — later rounds often re-report the same unfixed finding.

#### 2c: Plan-and-implement the big findings (`/big-plan -m -a -pc`)

Skip this step when the round's plan-and-implement list is empty.

From `$WORK_BRANCH` (`/big-plan` captures the current branch as its parent — that is what makes the chain merge the fixes back here), invoke:

```
Skill(skill="big-plan", args="-m -a -pc [-nori if passed] <distilled findings>")
```

- **The findings text** carries, per finding: `file:line` refs, what's wrong, the concrete fix direction, and acceptance criteria (at minimum "the reviewer's finding no longer reproduces"). Be specific enough that `/big-plan` never needs to ask a clarifying question — vague input stalls the chain at its own clarification gate, and concrete acceptance criteria keep the plan goal-clear so it runs end-to-end without pausing.
- **`-pc` / `--parent-confirmed`** declares the non-main parent branch (`$WORK_BRANCH`) intentional — without it, `/big-plan -a` falls back to a confirmation wait because the parent isn't `main`.
- **`-m -a`** make the chain autonomous and in-session: plan → epic + sub-issues → implementation (`/x-wt-teams` for a multi-sub-issue plan, `/x-as-pr` for single) → merge the root PR back into `$WORK_BRANCH` → cleanup. When it returns, the fixes are on `$WORK_BRANCH` and the next round reviews the improved code.

If `/big-plan` pauses anyway — it classified the plan design-decision, or its verification surfaced unresolved items — that is the intended human checkpoint: the loop stops there for the user to answer; do not try to skip past it. Routing only decidable findings (the bucket test) keeps this rare.

#### 2d: Early exit

If a round comes back clean — the reviewer reports 0 actionable findings and there was nothing to route — skip the remaining rounds. Report "No issues found — stopping early." For an in-place **branch diff**, later rounds typically find less, so this is the normal way the loop ends before N. In **Review-PR / full-project mode**, a whole-repo scan almost always finds *something* every round, so the loop usually runs all N and the PR accumulates broad, sometimes unrelated fixes — keep N small (1–2) there and expect a wide diff.

### Step 3: Finalize

**Both modes — raise deferred findings first:**

1. If the deferred list is empty, skip this.
2. Default (`-ri`): create one GitHub issue per distinct deferred finding with the `agent-found` label (ensure it exists first: `gh label create agent-found --color D93F0B --description "Found by agent during automated work" 2>/dev/null || true`). Group tightly-related findings into a single issue. Each issue body gets `file:line` references, what the reviewer found, and the decision it needs — what question a human must answer and why an agent couldn't settle it.
3. With `-nori`: skip issue creation; list the deferred findings prominently in the final report instead.

**Review-PR mode** (a review PR was created in Step 1):

1. Push `$REVIEW_BRANCH` to remote
2. Invoke `/pr-revise` to update PR #`$PR_NUM`'s title and description to reflect what the rounds fixed — both the reviewers' inline fixes and the per-round `/big-plan` chains' merged epics
3. Report the PR URL — fixes are staged in the PR targeting `$ORIG_BRANCH`, ready to merge after review — plus any deferred-finding issue URLs

**In-place mode:**

1. Report what was done across all rounds — inline fixes, per-round epics implemented, deferred-finding issue URLs. Fixes are committed on `$ORIG_BRANCH` and already pushed (each round pushes in Step 2a)

## Examples

### Basic: 2 rounds, auto mode

```
/review-loop
```

Auto-detects: on a branch **with** a PR → reviews in place; on a branch **without** a PR (including `main`) → creates a review branch + draft PR to the current branch and runs a full-project review there. Each round: review (safe fixes inline) → big findings fix-planned, implemented, and merged back via `/big-plan -m -a`.

### Five rounds

```
/review-loop 5
```

Runs up to 5 rounds, stopping early once a round is clean.

### Force a review PR even when one exists

```
/review-loop 3 --as-pr
```

Creates a review branch + draft PR (to the current branch), runs up to 3 rounds, updates the PR. Use `--as-pr` to isolate fixes in their own PR even if the current branch already has a PR.

### Force in-place on a no-PR branch

```
/review-loop --stay
```

Skips the review-PR flow and commits fixes directly to the current branch — even if it has no PR.

### No issues for deferred findings

```
/review-loop 3 -nori
```

Findings that need a human decision are listed in the final report instead of becoming GitHub issues (`-nori` is also forwarded to each round's `/big-plan` chain).

### Codex-powered review

```
/review-loop 3 --codex
```

Backend flag alone — runs `/codex-review` (OpenAI Codex CLI) for each round, codex-only.

### Opus + Codex in parallel

```
/review-loop 3 -op -co
```

Model flag **plus** backend flag — forwards to `/deep-review -nt -op -co`, running Opus reviewers **alongside** codex each round and fixing inline. Use this combo when you want both perspectives, not codex instead of Opus.

### GitHub Copilot-powered review

```
/review-loop 3 --github-copilot
```

Uses `/gco-review` (GitHub Copilot CLI, GPT-5.4) instead of `/deep-review` for each round.

### Quick single round

```
/review-loop 1
```

## Important Notes

- **Thin orchestrator:** review-loop never fixes code itself. Each round = one reviewer pass (safe fixes inline) + one optional `/big-plan -m -a -pc` chain for the big findings. review-loop only chooses the workspace, runs N rounds, routes unfixed findings between plan-and-implement and defer, and exits early when clean. This is why there is no `--aggressive` / `--defensive` threshold — the three-bucket fix policy is fixed.
- **Defer only for genuine decisions — size is not a reason to defer.** The historical failure mode: the loop filed every "big" finding as an issue and the app never actually improved. Now big-but-decidable findings are implemented in-round via `/big-plan -m -a`; the deferred list is reserved for findings that need a human preference (product/design choice, scope call, contract change the user must own). Bucket test: could a competent engineer implement it without asking anyone? Yes → plan-and-implement.
- **Always pass `-nt -nori` to `/deep-review`** — `-nt` so the reviewer fixes inline rather than spawning its own fix team (when `/x-wt-teams` runs in this loop it runs inside the Step 2c `/big-plan` chain — planned, issue-backed, merged back — never as a raw review-fix spawn), `-nori` so it doesn't raise issues per round (review-loop raises the deduped deferred list once at Step 3; one raise-owner per session).
- **Default 2 rounds — N scales freely.** Two rounds already mean review → implement → re-review → implement, which catches most of what a loop can catch. The per-round `/big-plan -m -a` chains run in-session but delegate the heavy lifting to subagent teams, so the manager session stays light — pass a bigger N when you want more passes.
- **Workspace mode (Step 1):** branch **with** a PR → review in place (diff vs PR base); branch **without** a PR → create a review branch + draft PR to the current branch and review there (full-project, since the new branch's diff is empty). `--stay` forces in-place; `--as-pr` forces the review-PR flow. `$WORK_BRANCH` (the branch the rounds run on) is also each round's `/big-plan` parent branch — the chain's `-m` merge is what lands the big fixes back on it.
- **Reviewer routing:** model flag (± backend) → `/deep-review -nt` (Claude reviewers + any backends in parallel, inline fix); backend flag alone → standalone `/codex-review` / `/gco-review`; no flags → `/codex-review`. Review-PR mode forces a model flag (`-op` default) because the empty diff needs full-project mode. Review-round flags never forward to the Step 2c `/big-plan` chain (only `-nori` does).
- With `--codex` (alone), review uses `/codex-review`. If codex is rate-limited, it silently falls back to **Opus** — `-co` means "the better reviewer." `--github-copilot` (alone) uses `/gco-review`, falling back to Claude reviewers if Copilot is rate-limited.
- **A `/big-plan` pause is a feature, not a failure.** If a round's chain stops at a confirmation gate (design-decision classification, unresolved verification), that's the "really necessary decision" case — the loop waits for the user there. Keep it rare by routing only decidable findings into the chain.
- Later rounds often find fewer issues as earlier rounds fixed the low-hanging fruit; a clean round ends the loop early.
- **Issues are for deferred findings only.** Fixed findings never get GitHub issues — the commit is the record for inline fixes, and the merged epic (closed by its chain's cleanup) is the record for plan-and-implement fixes. Deferred (decision-needing) findings become `agent-found` issues by default so the decision they need isn't lost when the session ends; `-nori` keeps them terminal-only.
