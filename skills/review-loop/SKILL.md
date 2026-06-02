---
name: review-loop
description: "Iterative code review loop running /deep-review multiple times, fixing issues each round. Finds bugs and quality issues through repeated passes. Use when: (1) User says 'review-loop', 'review loop', or 'review repeat', (2) User wants continuous review+fix cycles, (3) User wants thorough multi-pass review before finalizing code, (4) User says 'review 5 rounds' or similar."
user-invocable: true
argument-hint: "[count] [--stay|--as-pr] [-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap]"
---

# Review Loop

Run a reviewer skill repeatedly, fixing issues each round. Progressively kills bugs, improves code quality, and surfaces improvement opportunities.

**review-loop is a thin orchestrator: it does NOT apply fixes itself.** Each round it invokes one reviewer skill (`/deep-review -nt`, or a standalone backend) that reviews **and** fixes **and** commits in a single pass; review-loop's only jobs are picking the workspace (Step 1), running N rounds, and stopping early when a round comes back clean. This avoids double-fixing and keeps each round lightweight (no per-round `/x-wt-teams` spawn).

## Input Parsing

Parse arguments to extract:

- **count** (number): How many review rounds. Default: 3
- **(default, no `--stay`/`--as-pr`)**: Auto-detect from PR presence — if the current branch already has a PR, review **in place**; if it has no PR, create a review branch + draft PR to the current branch and review **there** (see Step 1).
- **--stay**: Force in-place — review and commit fixes directly on the current branch, even if it has no PR. (On the default branch this commits straight to `main`.)
- **--as-pr**: Force the review-PR flow — create a review branch + draft PR even when the current branch already has a PR.
- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Set the Claude model used when Claude reviewers run. Pick at most one. When reviewers run at a model, the default is `-op` (matches `/deep-review`). With no flags at all the round uses `/gcoc-review` (zero Premium); Review-PR mode forces `-op` if none is given (full-project scan needs it).
- **-co** or **--codex**: Add the OpenAI Codex reviewer. Codex review uses OpenAI Codex CLI for higher-quality reviews. If codex is rate-limited or unavailable, it silently falls back to **Opus** — so `-co` always means "the better reviewer."
- **-gco** or **--github-copilot**: Add the GitHub Copilot CLI reviewer.
- **-gcoc** or **--github-copilot-cheap**: Add the GitHub Copilot reviewer forced to the free `gpt-4.1` model (skips the Premium opus attempt).

**Backend routing — combine vs. replace (this is why `-op -co` means "opus AND codex").** A backend flag's behavior depends on whether a model flag is also present, mirroring `/deep-review`'s own augment semantics:

- **Model flag + backend flag(s)** (e.g. `-op -co`): forward everything to `/deep-review -nt`, which runs the Claude reviewers at that model **alongside** the requested backend(s) in parallel and fixes inline. This is the path that gives "opus + codex."
- **Backend flag alone, no model flag** (e.g. just `-co`): run that backend **instead of** Claude reviewers — invoke the standalone `/codex-review` / `/gco-review` / `/gcoc-review` (codex-only, Opus as rate-limit fallback). This is the "just give me codex" shortcut.
- **No flags at all**: `/gcoc-review` directly (zero Premium) — the same reviewer `/deep-review` defaults to.

`/deep-review -nt` accepts multiple backend flags at once, so `-op -co -gco` runs Opus reviewers + codex + Copilot in parallel. The standalone-skill path (backend flag alone) takes a single backend.

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
git commit --allow-empty -m "chore: start review-loop for ${ORIG_BRANCH}"
git push -u origin "$REVIEW_BRANCH"
gh pr create --draft --base "$ORIG_BRANCH" --head "$REVIEW_BRANCH" \
  --title "Review loop: ${ORIG_BRANCH}" \
  --body "Automated /review-loop fixes targeting \`${ORIG_BRANCH}\`. Each round's fixes are committed here."
PR_NUM=$(gh pr view --json number -q '.number')
```

All subsequent rounds run on `$REVIEW_BRANCH`. Its diff against the PR base (`$ORIG_BRANCH`) is **empty** (only the start commit), so the review is a **full-project scan**, not a branch diff — see the model-flag requirement in Step 2a. Report: "No PR on `$ORIG_BRANCH` — created review branch `$REVIEW_BRANCH` with draft PR #`$PR_NUM` → `$ORIG_BRANCH`; running a full-project review there."

### Step 2: Review Loop (repeat N times)

For each round (1 to N), invoke **one** reviewer skill that reviews + fixes + commits in a single pass, then check for early exit. review-loop never applies fixes itself.

#### 2a: Run the reviewer

review-loop applies no fixes of its own — it invokes one reviewer skill that reviews + fixes + commits. Always pass `-nt` to `/deep-review` so it fixes **inline** (no per-round `/x-wt-teams` spawn) — the team machinery is what we're avoiding in a multi-round loop.

**Branch on the Step 1 mode first** (this ordering matters — the no-flag path below would review an empty diff in Review-PR mode):

**Review-PR mode** — the review branch's diff is empty, so the diff-only reviewers (`/gcoc-review` / `/gco-review` / `/codex-review`) would find **nothing**; only `/deep-review`'s full-project mode (Mode B) does. So always invoke `/deep-review -nt` **with a model flag**, defaulting to `-op` when the user passed none, and forward any backend flags:

```
Skill(skill="deep-review", args="-nt -op [-co|-gco|-gcoc if passed]")
```

**In-place mode** — route by flags:

- **Model flag present** (with or without backend flags): `Skill(skill="deep-review", args="-nt -op -co")` (forward the model flag + every backend flag, plus `-nt`). Claude reviewers run alongside any backends in parallel, fix and commit inline, scoped to the branch diff (`$BASE...HEAD`).
- **Backend flag alone** (no model flag): invoke the standalone backend — `/codex-review` (`-co`), `/gco-review` (`-gco`), `/gcoc-review` (`-gcoc`). Each reviews, fixes, and commits on its own (verified: both have Apply-Fixes + Commit steps), falling back to Claude reviewers if its backend is rate-limited.
- **No flags**: invoke `/gcoc-review` (zero Premium) — the same reviewer `/deep-review` defaults to, called directly so it reviews + fixes + commits in one clean pass.

Wait for the reviewer to complete (it has already committed this round's fixes).

#### 2b: Report round results

Tell the user what was found and fixed in this round. Be concise.

#### 2c: Early exit

If a round comes back with 0 actionable findings (the reviewer reports "no issues"), skip the remaining rounds. Report "No issues found — stopping early." For an in-place **branch diff**, later rounds typically find less, so this is the normal way the loop ends before N. In **Review-PR / full-project mode**, a whole-repo scan almost always finds *something* every round, so the loop usually runs all N and the PR accumulates broad, sometimes unrelated fixes — keep N small (1–2) there and expect a wide diff.

### Step 3: Finalize

**Review-PR mode** (a review PR was created in Step 1):

1. Push `$REVIEW_BRANCH` to remote
2. Invoke `/pr-revise` to update PR #`$PR_NUM`'s title and description to reflect what the rounds fixed
3. Report the PR URL — fixes are staged in the PR targeting `$ORIG_BRANCH`, ready to merge after review

**In-place mode:**

1. Report what was done across all rounds. Fixes are committed on `$ORIG_BRANCH`; push if the branch tracks a remote and the user expects it pushed

## Examples

### Basic: 3 rounds, auto mode

```
/review-loop
```

Auto-detects: on a branch **with** a PR → reviews in place; on a branch **without** a PR (including `main`) → creates a review branch + draft PR to the current branch and runs a full-project review there.

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

Uses `/gco-review` (GitHub Copilot CLI) instead of `/deep-review` for each round.

### GitHub Copilot Cheap-powered review

```
/review-loop 3 --github-copilot-cheap
```

Uses `/gcoc-review` (GitHub Copilot CLI, forced to free `gpt-4.1` model) instead of `/deep-review` for each round.

### Quick single round

```
/review-loop 1
```

## Important Notes

- **Thin orchestrator:** review-loop never fixes code itself. Each round it invokes one reviewer skill that reviews + fixes + commits; review-loop only chooses the workspace, runs N rounds, and exits early when clean. This is why there is no `--aggressive` / `--defensive` threshold — the invoked reviewer owns the fix decisions.
- **Always pass `-nt` to `/deep-review`** so it fixes inline rather than spawning a `/x-wt-teams` team every round. A multi-round loop with per-round team spawns is exactly what `-nt` prevents.
- **Workspace mode (Step 1):** branch **with** a PR → review in place (diff vs PR base); branch **without** a PR → create a review branch + draft PR to the current branch and review there (full-project, since the new branch's diff is empty). `--stay` forces in-place; `--as-pr` forces the review-PR flow.
- **Reviewer routing:** model flag (± backend) → `/deep-review -nt` (Claude reviewers + any backends in parallel, inline fix); backend flag alone → standalone `/codex-review` / `/gco-review` / `/gcoc-review`; no flags → `/gcoc-review` (zero Premium). Review-PR mode forces a model flag (`-op` default) because the empty diff needs full-project mode.
- With `--codex` (alone), review uses `/codex-review`. If codex is rate-limited, it silently falls back to **Opus** — `-co` means "the better reviewer." `--github-copilot` / `--github-copilot-cheap` (alone) use `/gco-review` / `/gcoc-review`, each falling back to Claude reviewers if Copilot is rate-limited.
- Later rounds often find fewer issues as earlier rounds fixed the low-hanging fruit; a clean round ends the loop early.
- Do NOT create GitHub issues for review findings — findings are reported in the terminal only. Issues created for review findings tend to linger forever since they are not urgent enough to fix immediately
