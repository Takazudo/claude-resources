---
name: big-plan
description: "Planning skill for breaking down implementation work into an epic GitHub issue + child sub-issues. Use when: (1) User says '/big-plan', (2) User wants to plan any implementation (small or large) before coding, (3) User wants to split a feature into small issues for parallel agent team work, (4) User references existing issues to plan from (e.g. 'implement issue #123', 'plan all open issues', 'make plan for recent 3 open issues'). Auto-reads any project-scope `l-lessons-*` skills relevant to the topic (written by `/retro-notes`) before planning, so prior attempts in the same area inform the plan. Supports `-co`/`--codex` and/or `-gco`/`--github-copilot` (or `-gcoc`/`--github-copilot-cheap`) flags to get second opinions on the plan AND to run the post-creation verification step — when these flags are present, the matching reviewers handle Step 9 verification instead of the default Sonnet subagent; multiple flags can be combined and every specified reviewer runs in parallel with their findings consolidated. Saves a plan log to $HOME/cclogs/{slug}/ and verifies the original requirements are preserved in the created issues. Also supports **Super-Epic mode** — when the plan is too big to complete in one `/x-wt-teams` session (2+ distinct themes, or enough sub-tasks that a single session would overflow context), proposes splitting into a hierarchy of super-epic base → multiple epic bases, with each epic run as its own `/x-wt-teams` session to save token cost. Planning only — no code changes (except the super-epic anchor branch when Super-Epic mode is selected)."
argument-hint: <description-or-issue-refs> [-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-nor|--no-review]
---

# Big Plan

Planning-only skill. Explore the codebase, propose a breakdown, save a plan log to `$HOME/cclogs/{slug}/`, optionally get a second opinion (via Codex or GitHub Copilot), create GitHub issues, verify nothing was lost, and hand off to `/x-wt-teams` in a fresh session.

This skill is useful for **almost every implementation task**, not just huge ones. It captures intent, breaks work into reviewable units, and creates a paper trail that survives context compression.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Claude model used for subagents in the downstream `/x-wt-teams` (or `/x-as-pr`) session. `/big-plan` itself plans in the current session and doesn't change its own model; it just forwards the flag. Pick at most one. Default: none (the downstream skill uses its own default, which is `-op`).
- **`-co` or `--codex` flag**: If present, get a Codex second opinion on the saved plan before creating issues (see Step 5). Can be combined with `-gco` or `-gcoc` to run multiple reviewers in parallel.
- **`-gco` or `--github-copilot` flag**: If present, use GitHub Copilot CLI for second opinion and research. See "GitHub Copilot Mode" section. Can be combined with `-co`. **Mutually exclusive with `-gcoc`** (same tool, different model — pick one).
- **`-gcoc` or `--github-copilot-cheap` flag**: Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). See "GitHub Copilot Cheap Mode" section. Can be combined with `-co`. **Mutually exclusive with `-gco`** (same tool, different model — pick one).
- **Multiple reviewer flags** — when `-co` is combined with `-gco` (or `-gcoc`), every specified reviewer is invoked in parallel during Step 5 and their feedback is consolidated into a single `## Review Notes` section before user confirmation.
- **`-nor` or `--no-review` flag**: If present, run the planning end-to-end with no confirmation gates and no review steps. Skips Step 5 (second opinion), Step 6 (propose-to-user wait), Step 9 (requirements verification), the Step 3.5 Super-Epic confirmation prompt (auto-accept if triggered), and the equivalent S-5 / S-6 steps in Super-Epic mode. The plan is drafted, the log is saved, the issues are created, and the session ends. Use when you've already decided what to plan and just want the issues created. Mutually compatible with `-co` / `-gco` / `-gcoc` — but those reviewer flags become no-ops when `-nor` is also present (no review runs).
- **Existing issue references** — any of these trigger _existing-issue mode_ (see Step 1b):
  - A GitHub issue URL: `https://github.com/owner/repo/issues/123`
  - An issue number: `#123` or bare `123`
  - Phrases like "all open issues", "implement all issues"
  - Phrases like "recent N open issues" or "latest N issues"
- **Everything else**: free-text description of what to implement.

You can also receive a mix (e.g. "plan #45 and #47 with some auth cleanup on top"). Treat the issue refs as source material AND incorporate the extra free-text context.

## Branch Context (detect first, do NOT skip)

Before running any workflow step, capture the **current branch** — this is the **parent branch** the new implementation base branch will be created from and the branch its eventual PR will target.

```bash
PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Parent branch: $PARENT_BRANCH"
```

**Why this matters — read carefully:**

`/big-plan` is typically invoked **on the branch the new feature will land on**. The default assumption is NOT "PR into `main`" — it is "PR into whatever branch I'm on right now."

- If `$PARENT_BRANCH` is `main` (the common case) → new `base/{impl-title-slug}` is branched from `main` and its PR targets `main`. Behave as before.
- If `$PARENT_BRANCH` is anything else (e.g. `base/foo-impl`, `feature/x`, `develop`) → new `base/{impl-title-slug}` is branched from `$PARENT_BRANCH` and its PR targets `$PARENT_BRANCH`. This is the **nested-base** pattern (e.g. `base/new-impl` → `base/foo-impl` → `main`). It is intentional and common — do **NOT** silently swap in `main`.

**Use `$PARENT_BRANCH` everywhere this skill previously hardcoded `main`:**

- Step 7 epic body — "merges into `$PARENT_BRANCH` as one PR" (not "merges into main")
- Step S-7 super-epic body — "targets `$PARENT_BRANCH` via super-PR"
- Step S-9 — `git checkout "$PARENT_BRANCH"`, `git pull origin "$PARENT_BRANCH"`, `gh pr create --base "$PARENT_BRANCH"`
- Branch hierarchy diagrams in Super-Epic mode — root node is `$PARENT_BRANCH`, not `main`
- All hand-off messages mentioning the eventual merge target

**Surface the parent branch to the user in Step 6 (proposal)** so they can correct it if they accidentally invoked from the wrong branch. If `$PARENT_BRANCH` is not `main`, call it out explicitly as a confirmation gate — this is the case the user has historically had to fight.

## Workflow

### 1a. Understand the task (free-text mode)

If the user gave a free-text description, read it. If vague, ask one clarifying question before exploring.

### 1b. Fetch existing issues (existing-issue mode)

If the input references existing issues, fetch their full content (including embedded images) before planning. **Always use `gh-fetch-issue`** — `gh issue view` cannot read issue-embedded images.

**Single issue by URL or number:**

```bash
bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh <url-or-number>
```

**"All open issues":**

```bash
gh issue list --state open --json number,title,url --limit 50
```

Then fetch each returned issue via the `gh-fetch-issue` script above.

**"Recent N open issues":**

```bash
gh issue list --state open --json number,title,url,createdAt --limit N
```

Then fetch each via the `gh-fetch-issue` script.

Read every fetched `issue.md` file and any images in `assets/`. Understand the requirements fully before proceeding.

**Track the source issue numbers/URLs and their local `issue.md` paths** — you'll need them for verification (Step 9) and closing (Step 10).

### 1c. Read project lessons

Project-scope lessons skills (`l-lessons-*`) capture root-cause notes from previous attempts in the same area, written by `/retro-notes`. Read any that apply before planning so prior pain becomes permanent leverage.

```bash
ls .claude/skills/l-lessons-*/SKILL.md 2>/dev/null
```

For each `l-lessons-{area}` skill found, check whether `{area}` matches the topic being planned by reading its frontmatter `description`. For every relevant one, read its full `SKILL.md` content.

If you find one or more relevant lessons files, surface them to the user explicitly:

> Found {N} project lessons file(s) relevant to this area: `{l-lessons-foo}`, `{l-lessons-bar}`. Reading them before planning.

Use the lessons — especially the **Watch for next time** and **Would-skip-if-redoing** sections — to inform the plan in Step 3:

- When a sub-task is shaped by a past lesson, call it out under that sub-task in the plan log: `> Shaped by lesson: {trap or skip-if-redoing summary}`.
- If a previous attempt's "Would-skip-if-redoing" advice contradicts a sub-task you'd otherwise add, drop or simplify the sub-task.
- If a "Watch for next time" trap suggests a structural choice (e.g. "invert the transform at the input boundary"), bake that choice into the relevant sub-task's description rather than leaving it for the implementer to discover again.

If no `l-lessons-*` skills exist or none match the topic, skip silently and proceed to Step 2. This is enrichment, not a blocking step — never fail planning because lessons aren't there.

### 2. Explore the codebase

Do a thorough exploration of all relevant code. Read existing patterns, understand the architecture, identify what files will need to change and what new ones will be created. Be comprehensive — this is the expensive step that justifies a dedicated session.

### 3. Draft the plan

Break the implementation into sub-tasks that are:

- **Small** — completable in a single focused agent session (ideally under 20 tool calls)
- **Independent** — ideally parallelizable, or with clear sequential dependencies
- **Concrete** — scope is specific enough that an agent can start without asking questions

Identify the dependency order (which must come first, which can run in parallel).

### 3.5. Assess plan size — single-epic vs Super-Epic

Before saving the plan log, decide which of the two modes applies.

**Single-Epic (default)** — the drafted sub-tasks form a coherent scope that one `/x-wt-teams` session can handle. Proceed with Steps 4 onward as written.

**Super-Epic** — the plan is genuinely big. Switch to the hierarchical workflow described in the [Super-Epic Mode](#super-epic-mode) section below. Trigger Super-Epic when any of these are true:

- The sub-tasks naturally cluster into **2 or more distinct themes/areas** (e.g., "admin top page", "auth flow", "test infra" are separable concerns that could each be their own `/x-wt-teams` session)
- The total sub-task count is high enough that a single `/x-wt-teams` session would likely spill over the concurrency cap (>8 sub-tasks) or need multiple feedback-loop iterations to land
- Dependency order between clusters is clear — one group must land before the next can start

If Super-Epic applies, **propose it to the user now, before writing the plan log or creating any issues**:

> "This plan has N sub-tasks across M distinct themes: {theme 1}, {theme 2}, .... Running it as one `/x-wt-teams` session risks overflowing context and costs significant tokens. I recommend splitting it into M separate epics, each run in its own `/x-wt-teams` session. Proposed structure: super-epic base `base/{super-title-slug}` → `$PARENT_BRANCH` (substitute the actual current branch, e.g. `main` or `base/foo-impl`), then each epic base `base/{super-title-slug}-{theme}` → super-base. Shall I proceed in Super-Epic mode?"

Wait for confirmation. If the user accepts, jump to the [Super-Epic Mode](#super-epic-mode) section. If declined, continue with Step 4 as normal.

**`-nor` / `--no-review` override:** Skip the confirmation wait entirely. If Super-Epic triggers based on the criteria above, auto-proceed to Super-Epic mode without asking. If it does not trigger, continue to Step 4. Tell the user which mode was selected, but do not pause.

### 4. Save plan log to cclogs

Save the draft plan before anything else. This is the source of truth for review, second opinions, verification, and later reference.

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
# SLUG is the kebab-case impl-title (see Naming Conventions)
PLAN_FILE="$LOGDIR/${DATETIME}-big-plan-${SLUG}.md"
```

Write the plan to `$PLAN_FILE` as a markdown document containing:

- `# Big Plan: {Impl Title}`
- **Source** — either the free-text description verbatim, or the list of source issues (number, title, URL, and brief summary of each)
- **Overview** — what's being built and why
- **Base branch** — `base/{impl-title-slug}`
- **Epic issue title** (proposed)
- **Sub-tasks** — for each:
  - Proposed sub-issue title
  - Description
  - Files to touch / create
  - Acceptance criteria
  - Dependencies on other sub-tasks
- **Architectural decisions / rationale**
- **Original requirements checklist** — bullet list of every concrete requirement from the source (free-text or source issues). Used in Step 9 for verification.

Report the path to the user: `Plan saved: $PLAN_FILE`.

### 5. (Optional) Second opinion — `-co` / `--codex`, `-gco` / `--github-copilot`, or `-gcoc` / `--github-copilot-cheap`

**Skip this step entirely if `-nor` / `--no-review` was passed**, even if one of the reviewer flags is also present. No `## Review Notes` section is added to `$PLAN_FILE`. Proceed directly to Step 6.

Only if one or more of `-co`/`--codex`, `-gco`/`--github-copilot`, or `-gcoc`/`--github-copilot-cheap` was in `$ARGUMENTS`. Multiple flags may be specified — `-co` combines with `-gco` or `-gcoc` (but `-gco` and `-gcoc` are mutually exclusive since they are the same tool with different models).

The review questions are the same regardless of tool:

1. Is the breakdown sound? Any sub-tasks too large or too coupled?
2. Are there missing sub-tasks or hidden dependencies?
3. Are there risks or edge cases not covered?
4. Is the dependency order correct? Can more run in parallel?
5. Are any original requirements from the source missing from the plan?

**Run every specified reviewer in parallel.** Determine which flags are active, then invoke the corresponding sub-skills concurrently (single assistant turn, multiple tool calls). Each reviewer reads the same `$PLAN_FILE` and answers the same questions above — they don't need to coordinate.

> **Skill names are top-level, not plugin-namespaced.** Invoke via `Skill(skill="codex-2nd")`, `Skill(skill="gco-2nd")`, `Skill(skill="gcoc-2nd")`. Do **NOT** use `codex:codex-2nd` — that namespace belongs to the openai-codex plugin and does not contain these skills.

**Per-flag invocation:**

- **`-co` / `--codex` — `/codex-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/codex-2nd/SKILL.md`. Pass the contents of `$PLAN_FILE` as context.
- **`-gco` / `--github-copilot` — `/gco-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/gco-2nd/SKILL.md`. Pass `$PLAN_FILE` as context. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the subagent fallback for that reviewer.
- **`-gcoc` / `--github-copilot-cheap` — `/gcoc-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/gcoc-2nd/SKILL.md`. Pass `$PLAN_FILE` as context. If Copilot is rate-limited, `/gcoc-2nd` silently skips — fall through to the subagent fallback for that reviewer.

**Consolidate feedback from all reviewers.** When multiple reviewers were invoked:

- Collect each reviewer's output.
- Under `## Review Notes` in `$PLAN_FILE`, add one subsection per reviewer (e.g. `### Codex review`, `### GitHub Copilot review`). Record the raw feedback verbatim or as a faithful summary.
- If reviewers disagree, note the disagreement and use your own judgment — you don't have to accept every suggestion. Prefer changes that multiple reviewers flag, or that are clearly correct.
- If a reviewer was skipped (rate limit / timeout), note that under its subsection and — if the skip leaves you with zero external reviews — run the subagent fallback below to avoid proceeding with no second opinion at all.

**Fallback: subagent review (when a reviewer is rate-limited or unavailable)**

If a specific reviewer's pre-flight rate-limit check fails or it times out, fall back to a Plan subagent via the Agent tool **for that reviewer only** (the other reviewers still run as normal). Prompt the agent with the same review questions and point it at `$PLAN_FILE`:

```
Review the big-plan document at {PLAN_FILE}. Focus on:
1. Is each sub-task small enough for a single focused agent session (≤20 tool calls)?
2. Are dependencies correct? Can anything run more in parallel?
3. Are there missing sub-tasks, hidden coupling, or risks?
4. Are acceptance criteria concrete enough for an agent to implement without asking questions?
5. Does the plan cover every item in the "Original requirements checklist" section?

Return a concise list of concrete suggestions. If the plan is solid, say so.
```

**Incorporate useful feedback** by updating `$PLAN_FILE` in place (Edit tool) before proceeding. The `## Review Notes` section should leave a paper trail of what each reviewer said and which suggestions were applied.

### 6. Propose to user before creating issues

Present the (optionally refined) plan to the user:

- Plan log path: `$PLAN_FILE`
- Proposed `impl-title`
- **Parent branch (detected current branch): `$PARENT_BRANCH`** — the new base branch will be created from this and the eventual PR will target this. If this is **not** `main`, explicitly call it out: "We are on `$PARENT_BRANCH`, so the new `base/{impl-title-slug}` will branch off `$PARENT_BRANCH` and PR into it (nested base). Confirm this is what you want — if you meant `main`, switch branches and re-run." Do not assume `main`.
- Suggested base branch: `base/{impl-title-slug}` (parent: `$PARENT_BRANCH`)
- List of sub-tasks with dependency notes
- Source issues (if existing-issue mode)
- Review notes (if any of `-co` / `-gco` / `-gcoc` was used — may contain multiple reviewer subsections when flags were combined)

Ask: "Does this look right? Should I adjust anything before creating the issues?"

**Wait for confirmation before proceeding.** If the user requests changes, update `$PLAN_FILE` and re-confirm.

**`-nor` / `--no-review` override:** Skip the question and the wait. Print the same proposal as a one-shot summary so the user can see what's about to be created, then proceed straight to Step 7. The user opted in to no-confirmation mode by passing the flag.

### 7. Create the epic issue

Create the epic first to get its URL.

**Before the first `gh issue create` of this session**, ensure the tier labels exist on the repo — see [Issue Labels](#issue-labels) and run the bootstrap block once.

Pass `--label epic` to the `gh issue create` call.

**Title format:** `[{Impl Title}][Epic] {Feature name}`

Example: `[Team Feature][Epic] Team management and workspace sharing`

**Body must include:**

- One-line description: "This is an epic tracking issue for the **{Impl Title}** implementation."
- Overview of what's being built
- Source issues section (if existing-issue mode): "Supersedes: #A, #B, #C"
- Base branch: `base/{impl-title-slug}` — all sub-issue PRs target this branch
- **Parent branch:** `$PARENT_BRANCH` (the branch this base will eventually PR into — substitute the actual branch name, e.g. `main` or `base/foo-impl`)
- Note: "Implementation will be done via `/x-wt-teams` — child branches merge into the base branch, which then merges into `$PARENT_BRANCH` as one PR" (substitute the actual parent branch name)
- **Sub-issues table** listing all child issues (fill in URLs in Step 9 — or note "see comments below")
- "Close each sub-issue as its implementation is merged."

### 8. Create child issues

Create each sub-issue with `gh issue create --label sub`.

**Title format:** `[{Impl Title}][Sub] {Task name}`

Example: `[Team Feature][Sub] D1 schema migration`

**Body must start with:**

```
- {epic-issue-url}

---
```

Then the rest of the body: what needs to be done, which files to touch, what the acceptance criteria are. Be specific enough that an agent can implement it without this planning session's context.

Include at the bottom:

```
**Base branch:** `base/{impl-title-slug}` — PR targets this branch (which itself targets `$PARENT_BRANCH`, e.g. `main` or `base/foo-impl` — substitute the actual parent name).
```

Then update the epic issue body to include the full list of sub-issue URLs (`gh issue edit {epic-number} --body "$(cat <<'EOF' ... EOF)"`).

### 9. Verify original requirements are preserved

**Skip this step entirely if `-nor` / `--no-review` was passed.** Do not spawn the verification reviewer, do not write a `## Verification Report` to `$PLAN_FILE`, do not block before Step 10. Proceed directly to Step 10. The user opted out of verification by passing the flag.

**This step is critical.** We've had cases where the original requirements were lost when rearranged into epic + sub-issues. One or more verification reviewers cross-check the created issues against the original source.

**Pick the verification reviewer(s) based on flags** (the same flags that drive Step 5):

- **No external reviewer flag** (default) → spawn a `general-purpose` agent with `model: sonnet` via the Agent tool.
- **`-co` / `--codex`** → use `/codex-2nd` for verification.
- **`-gco` / `--github-copilot`** → use `/gco-2nd` for verification.
- **`-gcoc` / `--github-copilot-cheap`** → use `/gcoc-2nd` for verification.
- **Multiple flags combined** → run every specified external reviewer **in parallel** (single assistant turn, multiple tool calls) and consolidate their findings into a single `## Verification Report`. When reviewers disagree, prefer findings flagged by multiple reviewers; use your own judgment for one-off claims.
- **Fallback** — if a flagged external reviewer's pre-flight rate-limit check fails or it times out, fall back to the Sonnet subagent **for that reviewer only** (other reviewers still run as usual). If all flagged reviewers skip and there is no Sonnet result either, run the Sonnet subagent once so verification still happens — never proceed to Step 10 with zero verification.
- The Sonnet subagent is also acceptable as an additional reviewer alongside flagged ones if you want extra coverage, but it is **not required** when at least one external reviewer succeeds.

The verification task is the **same regardless of which tool runs it**:

1. Read the original source:
- Free-text mode: the user's original description (paste it into the prompt, plus `$PLAN_FILE`)
- Existing-issue mode: each source `issue.md` path from Step 1b
2. Read each created issue via `gh issue view {number}` — the epic AND every sub-issue (pass the issue numbers in the prompt)
3. Compare and identify:
- **Missing requirements** — items present in the source but not covered by any issue
- **Misinterpreted requirements** — items in an issue that don't match the source intent
- **Ambiguous coverage** — items partially addressed but not concrete enough
4. Return a structured report:

```
## Verification Report

### Missing from issues
- [source ref] <what's missing>
- ...

### Misinterpreted
- [issue #N] <what's wrong>
- ...

### Ambiguous
- [issue #N] <what needs clarification>
- ...

### All clear
<list of source items that were correctly covered — can be brief>
```

**Sonnet subagent invocation (default / fallback)** — example Agent tool call shape (written out for clarity, not a literal JSON):

- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- `description`: `Verify issues preserve source requirements`
- `prompt`: self-contained prompt with the source, issue numbers, and the report format above

**External reviewer invocation (when `-co` / `-gco` / `-gcoc` is passed):**

For each active flag, follow the invocation pattern in the corresponding skill's SKILL.md (`$HOME/.claude/skills/codex-2nd/SKILL.md`, `$HOME/.claude/skills/gco-2nd/SKILL.md`, `$HOME/.claude/skills/gcoc-2nd/SKILL.md`). These are top-level skills — invoke via `Skill(skill="codex-2nd")` / `Skill(skill="gco-2nd")` / `Skill(skill="gcoc-2nd")`, never `codex:codex-2nd`. Replace each tool's default "review the plan" prompt with the verification prompt structured as above. The prompt MUST include:

- The original source (paste the free-text description verbatim, or list every source `issue.md` path)
- The full list of created issue numbers (epic + every sub-issue) and a note that the reviewer can run `gh issue view {number}` to inspect each issue body
- The exact report format above so output is consistent across reviewers

**Handling the report:**

- If **all clear** with no issues, report the verification result to the user and proceed to Step 10.
- If anything is missing/misinterpreted/ambiguous, **fix the issues directly** using `gh issue edit {number} --body "$(cat <<'EOF' ... EOF)"`. Edit the relevant sub-issue (or epic) body to include the missing requirement. Re-run the verification on the fixed issues to confirm — re-using whichever reviewer(s) flagged the gap is fine.
- Save the final verification report to `$PLAN_FILE` under a `## Verification Report` section. When multiple reviewers ran in parallel, save one subsection per reviewer (e.g. `### Codex verification`, `### GitHub Copilot verification`, `### Sonnet verification`). If a flagged reviewer was skipped (rate limit / timeout) and Sonnet ran as fallback, note the skip under its own subsection.

Do not skip this step even if the plan looks obviously complete.

### 10. Close source issues (existing-issue mode only)

If the plan was started from existing issues (Step 1b), close each source issue with a comment linking to the new epic.

For each source issue:

```bash
gh issue comment <source-issue-number> --body "Superseded by the big-plan epic: {epic-url}

Follow-up work is now tracked on that epic and its sub-issues."

gh issue close <source-issue-number>
```

Report each close to the user.

### 11. End the session

Print a summary:

```
## Plan complete

Plan log: {PLAN_FILE}
Epic: {epic-url}

Sub-issues:
- {url} — {title}
- {url} — {title}
...

Base branch: base/{impl-title-slug}

Closed source issues: {list or "none"}
Verification: {all clear / N fixes applied}

---

This session is done. Token cost grows quadratically with session length —
start a **fresh session** and run:

  /x-wt-teams {epic-issue-url}
```

Do NOT start implementing. Do NOT create the base branch. The next session handles that.

## Naming Conventions

| Thing | Format | Example |
|---|---|---|
| `impl-title` display | Title Case, short | `Team Feature` |
| `impl-title` slug | kebab-case | `team-feature` |
| Epic issue title | `[{Impl Title}][Epic] {description}` | `[Team Feature][Epic] Team management` |
| Sub issue title | `[{Impl Title}][Sub] {task}` | `[Team Feature][Sub] D1 schema migration` |
| Base branch | `base/{impl-title-slug}` | `base/team-feature` |
| Plan log file | `{YYYYMMDD_HHMMSS}-big-plan-{slug}.md` | `20260412_1530-big-plan-team-feature.md` |

### Super-Epic extensions

| Thing | Format | Example |
|---|---|---|
| Super-Epic issue title | `[{Impl Title}][Super-Epic] {description}` | `[Admin App][Super-Epic] Admin app dev` |
| Epic issue title (under super-epic) | `[{Impl Title}][Epic] {theme}` | `[Admin App][Epic] Top page` |
| Sub issue title (under epic) | `[{Impl Title}][Sub] {task}` | `[Admin App][Sub] Header nav component` |
| Super-Epic base branch | `base/{super-title-slug}` | `base/admin-app-dev` |
| Epic base branch (under super-epic) | `base/{super-title-slug}-{epic-slug}` | `base/admin-app-dev-top` |
| Topic branch (under epic in `/x-wt-teams`) | `{super-title-slug}-{epic-slug}/{topic}` | `admin-app-dev-top/css` |

## Issue Labels

Every issue this skill creates carries a tier label so the hierarchy is scannable at a glance in the GitHub issue list. Each tier uses a distinct color hue to make them easy to tell apart visually.

| Tier | Label | Color | Used in |
|---|---|---|---|
| Super-Epic | `super-epic` | `#5319E7` (deep purple) | Step S-7 |
| Epic | `epic` | `#1D76DB` (blue) | Step 7 (single-epic mode), Step S-8 (under a super-epic) |
| Sub | `sub` | `#0E8A16` (green) | Step 8 (single-epic mode only) |

**Ensure labels exist before the first `gh issue create` call of the session.** Run this bootstrap block once per session. Safe to re-run — `gh label create` is only invoked when the label is missing, so pre-existing customized colors are preserved:

```bash
ensure_label() {
  local name="$1" color="$2" desc="$3"
  if ! gh label list --limit 200 --json name --jq '.[].name' | grep -Fxq "$name"; then
    gh label create "$name" --color "$color" --description "$desc"
  fi
}

ensure_label "super-epic" "5319E7" "Big-plan super-epic tracking multiple epics"
ensure_label "epic"       "1D76DB" "Big-plan epic tracking multiple sub-issues or topics"
ensure_label "sub"        "0E8A16" "Big-plan sub-task under an epic"
```

Apply `--label {tier}` on each `gh issue create`:

- Single-epic mode → epic issue: `--label epic` (Step 7); each sub-issue: `--label sub` (Step 8).
- Super-Epic mode → super-epic issue: `--label super-epic` (Step S-7); each epic issue: `--label epic` (Step S-8).

## Super-Epic Mode

This overlay replaces Steps 4 through 11 of the default flow when Super-Epic was confirmed in Step 3.5. All other steps (exploration, verification, second opinion) remain the same.

### Why Super-Epic exists

A single `/x-wt-teams` session has real scaling limits: max 6 concurrent child agents, manager context fills up during merge/review/CI, and every feedback round costs significant tokens. When a plan genuinely spans multiple themes, running it as one session means context compression, lost detail, and expensive reruns. The Super-Epic structure splits the work into independently runnable epics — each in its own fresh session — so **every epic starts with a clean context window**. The super-epic PR just accumulates the merged epic PRs into one reviewable whole.

### Branch hierarchy

The root of the hierarchy is **`$PARENT_BRANCH` (the branch the user invoked `/big-plan` from)** — usually `main`, but can be any branch (e.g. `base/foo-impl`) when nesting bases. Substitute the actual branch name in the diagram below; never hardcode `main`.

```
$PARENT_BRANCH                                       (current branch at /big-plan invocation — usually main, but could be base/foo-impl etc.)
  └── base/{super-title-slug}                       (super-epic base — long-lived anchor; super-PR → $PARENT_BRANCH)
        ├── base/{super-title-slug}-{epicA-slug}    (epic base; epic-PR → super-base)
        │     ├── {super-title-slug}-{epicA-slug}/topic1
        │     └── {super-title-slug}-{epicA-slug}/topic2
        ├── base/{super-title-slug}-{epicB-slug}    (epic base; epic-PR → super-base)
        │     └── ...
        └── base/{super-title-slug}-{epicC-slug}    (epic base; epic-PR → super-base)
              └── ...
```

### S-4. Save plan log (Super-Epic)

Same as Step 4, but the plan log should state this is a Super-Epic and list each epic cluster with its sub-tasks. Use this structure in the log:

- `# Super-Epic Plan: {Impl Title}`
- **Source** (free-text or source issues)
- **Overview**
- **Super-epic base branch:** `base/{super-title-slug}`
- **Super-epic issue title** (proposed)
- **Epics** — for each:
  - Proposed epic issue title and theme
  - Epic base branch: `base/{super-title-slug}-{epic-slug}`
  - Dependency note (which other epics must land first)
  - Sub-tasks belonging to this epic (title, description, files, acceptance criteria)
- **Architectural decisions / rationale**
- **Original requirements checklist**

### S-5. (Optional) Second opinion

Same as Step 5. Ask the reviewer to additionally confirm: (a) the split into epics is sensible, (b) the dependency order is correct, (c) no sub-task belongs to a different epic than proposed.

**`-nor` / `--no-review` override:** Skip this step entirely (same rule as Step 5).

### S-6. Propose the Super-Epic structure to user

Show the user: super-epic base branch, each epic base branch, epic dependency order, sub-tasks per epic. Wait for confirmation before creating anything.

**`-nor` / `--no-review` override:** Print the same proposal as a one-shot summary, then proceed straight to S-7 without waiting (same rule as Step 6).

### S-7. Create the super-epic issue

**Before the first `gh issue create` of this session**, ensure the tier labels exist on the repo — see [Issue Labels](#issue-labels) and run the bootstrap block once.

Create with `gh issue create --label super-epic`.

```
Title: [{Impl Title}][Super-Epic] {Feature name}
```

Body includes:

- "This is a **Super-Epic** tracking issue for the **{Impl Title}** implementation."
- Overview of what's being built and why it was split
- **Super-epic base branch:** `base/{super-title-slug}` (targets `$PARENT_BRANCH` via super-PR — substitute the actual parent branch name)
- Super-PR URL (filled in at S-9)
- **Epic issues table** (filled in at S-8 — URL, title, epic base branch, dependency order)
- "Each epic is implemented via its own `/x-wt-teams` session. Epic PRs target `base/{super-title-slug}`. Once all epic PRs are merged, the super-PR becomes ready to merge into `$PARENT_BRANCH`." (substitute the actual parent branch name)

### S-8. Create one epic issue per cluster

For each epic cluster, create a GitHub issue with `gh issue create --label epic`. **The body MUST include machine-readable markers that `/x-wt-teams` parses to detect Super-Epic parentage.**

```
Title: [{Impl Title}][Epic] {Theme}
```

Body template (the three marker lines are mandatory, exact spelling matters):

```markdown
- {super-epic-issue-url}

---

**Super-epic:** #{super-epic-issue-number}
**Super-epic base branch:** `base/{super-title-slug}`
**This epic's base branch:** `base/{super-title-slug}-{epic-slug}`

## Overview

<1-2 sentences on what this epic covers and why>

## Dependencies

<Which other epics must land first, if any. "None" if independent.>

## Sub-tasks

- **{sub-task 1 title}** — <description, files, acceptance criteria>
- **{sub-task 2 title}** — <...>
...

## Instructions for `/x-wt-teams`

Run this epic in a fresh Claude Code session:

    /x-wt-teams {this-epic-issue-url}

The session will create `base/{super-title-slug}-{epic-slug}` off `base/{super-title-slug}` and merge the resulting epic-PR into the super-epic base.
```

Each sub-task becomes a topic inside that epic's `/x-wt-teams` session (`/x-wt-teams` reads them from the body). Do **not** create separate `[Sub]` issues in Super-Epic mode — the sub-tasks are already listed inline inside each epic body.

Then update the super-epic issue (S-7) to list all epic issue URLs in dependency order.

### S-9. Create the super-epic base branch + draft super-PR

Super-Epic mode **does** create the super-epic anchor branch. This is the single exception to big-plan's usual "no branches" rule — the super-PR must exist before any epic session starts, so epic PRs have a target, and the super-PR accumulates every merged epic.

**Use `$PARENT_BRANCH` (captured in "Branch Context" before Step 1) — do NOT hardcode `main`.** If the user invoked from `base/foo-impl`, the super-epic anchor must branch off `base/foo-impl` and the super-PR must target `base/foo-impl`, not `main`.

```bash
git checkout "$PARENT_BRANCH"
git pull origin "$PARENT_BRANCH"
git checkout -b base/{super-title-slug}
git commit --allow-empty -m "= start {super-title-slug} super-epic ="
git push -u origin base/{super-title-slug}

SUPER_PR_URL=$(gh pr create \
  --base "$PARENT_BRANCH" \
  --title "{Impl Title}: super-epic root PR" \
  --body "$(cat <<EOF
## Summary

Super-epic root PR for **{Impl Title}**. This PR accumulates all epic PRs merged into \`base/{super-title-slug}\` and will be merged into \`$PARENT_BRANCH\` when all epics are complete.

Tracking super-epic issue: {super-epic-issue-url}

## Epics

(To be filled in as epic PRs are opened.)
EOF
)" \
  --draft)
```

(Heredoc is unquoted so `$PARENT_BRANCH` expands. The literal-text placeholders like `{super-title-slug}` are still substituted by you when writing the actual command.)

Edit the super-epic issue to record `SUPER_PR_URL`.

**Do not create the epic base branches or epic-PRs here.** Each `/x-wt-teams` session creates its own epic base off `base/{super-title-slug}`.

### S-10. Verification

Run the same verification flow from Step 9 (same flag-driven reviewer selection — Sonnet by default, or `/codex-2nd` / `/gco-2nd` / `/gcoc-2nd` in parallel when their flags were passed; same fallback to Sonnet on rate limit), but point the reviewer(s) at the super-epic issue + all epic issues (not `[Sub]` issues — they do not exist in Super-Epic mode). Confirm every original requirement maps to exactly one sub-task inside one epic.

### S-11. Hand-off message

Print:

```
## Super-Epic plan complete

Plan log: {PLAN_FILE}
Super-epic issue: {super-epic-url}
Super-epic base: base/{super-title-slug}  (super-PR: {SUPER_PR_URL} → $PARENT_BRANCH)

Epics (run each in a FRESH session, in dependency order):

1. {epic-A-url} — {theme A}
     → /x-wt-teams {epic-A-url}

2. {epic-B-url} — {theme B}   (depends on: epic A)
     → /x-wt-teams {epic-B-url}

3. {epic-C-url} — {theme C}   (depends on: epic A)
     → /x-wt-teams {epic-C-url}

Closed source issues: {list or "none"}
Verification: {all clear / N fixes applied}

---

This session is done. Token cost grows quadratically with session length —
start a **fresh session** for each epic. After all epic PRs are merged into
base/{super-title-slug}, the super-PR will be ready to merge into $PARENT_BRANCH.
```

Do NOT start implementing. Do NOT create any epic base branch or worktree. The next session (a fresh `/x-wt-teams` per epic) handles all of that.

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

Can be combined with `-co` — see Step 5 for how multiple reviewers run in parallel. Mutually exclusive only with `-gcoc` (same tool, different model).

When `-gco` or `--github-copilot` is passed, the following tooling is enabled:

| Workflow slot | GCO tool | Used for |
|---|---|---|
| Step 5 second opinion | `/gco-2nd` | Copilot review of the plan |
| Step 2 research (if needed) | `/gco-research` | Web research during exploration |

**How it affects the workflow:**

- **Step 2 (Explore the codebase)**: When you need to research libraries, APIs, or best practices, prefer `/gco-research` over the Agent tool or WebSearch.
- **Step 5 (Second opinion)**: Invoke `/gco-2nd` — in parallel with `/codex-2nd` if `-co` was also passed. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the Plan subagent fallback for that reviewer.

All other workflow steps (issue creation, verification, etc.) remain unchanged.

## GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

Same as `-gco` above, but forces the free `gpt-4.1` model (skips the Premium opus attempt). Can be combined with `-co`. Mutually exclusive with `-gco` (same tool, different model — pick one).

When `-gcoc` or `--github-copilot-cheap` is passed, the following tooling is enabled:

| Workflow slot | GCOC tool | Used for |
|---|---|---|
| Step 5 second opinion | `/gcoc-2nd` | Copilot (cheap) review of the plan |
| Step 2 research (if needed) | `/gcoc-research` | Web research during exploration |

**How it affects the workflow:**

- **Step 2 (Explore the codebase)**: When you need to research libraries, APIs, or best practices, prefer `/gcoc-research` over the Agent tool or WebSearch.
- **Step 5 (Second opinion)**: Invoke `/gcoc-2nd` — in parallel with `/codex-2nd` if `-co` was also passed. If Copilot is rate-limited, `/gcoc-2nd` silently skips — fall through to the Plan subagent fallback for that reviewer.

All other workflow steps (issue creation, verification, etc.) remain unchanged.

## Key Principles

- **Parent branch is the current branch — NOT `main`** — `/big-plan` is invoked on the branch the new feature will land on. Capture `$PARENT_BRANCH = git rev-parse --abbrev-ref HEAD` first and use it everywhere a base branch parent or PR target is needed. Do not silently assume `main`. Surface the detected `$PARENT_BRANCH` to the user in Step 6 (especially when it is not `main`) so they can correct it
- **No code changes in this session** — planning and issue creation only (sole exception: the super-epic anchor branch in Super-Epic mode, branched off `$PARENT_BRANCH`)
- **Read project lessons before planning** — Step 1c auto-reads any matching `l-lessons-*` skills (written by `/retro-notes`) so previous attempts in the same area inform the plan. Skip silently if none apply
- **Save the plan log first** — before codex, before confirmation, before issues. It's the source of truth
- **Confirm before creating** — always show the plan to the user first
- **Verify after creating** — always verify so original requirements aren't lost. Default reviewer is the Sonnet subagent; when `-co`/`-gco`/`-gcoc` is passed, those tools handle verification (in parallel if multiple), with Sonnet as fallback if any are rate-limited
- **Small issues win** — an issue that takes 15 agent exchanges is better than one that takes 50
- **Self-contained sub-issues** — each issue body must be readable standalone, without needing this session's context
- **Fresh session next** — always end by instructing the user to start a new session with `/x-wt-teams`
- **No `~` in paths** — always use `$HOME`
