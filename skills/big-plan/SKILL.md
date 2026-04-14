---
name: big-plan
description: "Planning skill for breaking down implementation work into an epic GitHub issue + child sub-issues. Use when: (1) User says '/big-plan', (2) User wants to plan any implementation (small or large) before coding, (3) User wants to split a feature into small issues for parallel agent team work, (4) User references existing issues to plan from (e.g. 'implement issue #123', 'plan all open issues', 'make plan for recent 3 open issues'). Supports `-co`/`--codex` or `-gco`/`--github-copilot` flag to get a second opinion on the plan before creating issues. Saves a plan log to $HOME/cclogs/{slug}/ and verifies the original requirements are preserved in the created issues. Planning only — no code changes."
argument-hint: <description-or-issue-refs> [-co|--codex] [-gco|--github-copilot]
---

# Big Plan

Planning-only skill. Explore the codebase, propose a breakdown, save a plan log to `$HOME/cclogs/{slug}/`, optionally get a second opinion (via Codex or GitHub Copilot), create GitHub issues, verify nothing was lost, and hand off to `/x-wt-teams` in a fresh session.

This skill is useful for **almost every implementation task**, not just huge ones. It captures intent, breaks work into reviewable units, and creates a paper trail that survives context compression.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **`-co` or `--codex` flag**: If present, get a codex second opinion on the saved plan before creating issues (see Step 5). Mutually exclusive with `-gco`.
- **`-gco` or `--github-copilot` flag**: If present, use GitHub Copilot CLI for second opinion and research. See "GitHub Copilot Mode" section. Mutually exclusive with `-co`.
- **Existing issue references** — any of these trigger _existing-issue mode_ (see Step 1b):
  - A GitHub issue URL: `https://github.com/owner/repo/issues/123`
  - An issue number: `#123` or bare `123`
  - Phrases like "all open issues", "implement all issues"
  - Phrases like "recent N open issues" or "latest N issues"
- **Everything else**: free-text description of what to implement.

You can also receive a mix (e.g. "plan #45 and #47 with some auth cleanup on top"). Treat the issue refs as source material AND incorporate the extra free-text context.

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

### 2. Explore the codebase

Do a thorough exploration of all relevant code. Read existing patterns, understand the architecture, identify what files will need to change and what new ones will be created. Be comprehensive — this is the expensive step that justifies a dedicated session.

### 3. Draft the plan

Break the implementation into sub-tasks that are:

- **Small** — completable in a single focused agent session (ideally under 20 tool calls)
- **Independent** — ideally parallelizable, or with clear sequential dependencies
- **Concrete** — scope is specific enough that an agent can start without asking questions

Identify the dependency order (which must come first, which can run in parallel).

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

### 5. (Optional) Second opinion — `-co` / `--codex` or `-gco` / `--github-copilot`

Only if `-co`/`--codex` or `-gco`/`--github-copilot` was in `$ARGUMENTS`.

The review questions are the same regardless of tool:

1. Is the breakdown sound? Any sub-tasks too large or too coupled?
2. Are there missing sub-tasks or hidden dependencies?
3. Are there risks or edge cases not covered?
4. Is the dependency order correct? Can more run in parallel?
5. Are any original requirements from the source missing from the plan?

**With `-co` / `--codex` — Primary path: `/codex-2nd`**

Follow the invocation pattern in `$HOME/.claude/skills/codex-2nd/SKILL.md`. Pass the contents of `$PLAN_FILE` as context and ask for review focused on the questions above.

**With `-gco` / `--github-copilot` — Primary path: `/gco-2nd`**

Follow the invocation pattern in `$HOME/.claude/skills/gco-2nd/SKILL.md`. Pass the contents of `$PLAN_FILE` as context and ask for review focused on the questions above. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the subagent fallback below.

**Fallback: subagent review (when codex/copilot is rate-limited or unavailable)**

If the codex/copilot pre-flight rate-limit check fails, or it times out, fall back to a Plan subagent via the Agent tool. Prompt the agent with the same review questions and point it at `$PLAN_FILE`:

```
Review the big-plan document at {PLAN_FILE}. Focus on:
1. Is each sub-task small enough for a single focused agent session (≤20 tool calls)?
2. Are dependencies correct? Can anything run more in parallel?
3. Are there missing sub-tasks, hidden coupling, or risks?
4. Are acceptance criteria concrete enough for an agent to implement without asking questions?
5. Does the plan cover every item in the "Original requirements checklist" section?

Return a concise list of concrete suggestions. If the plan is solid, say so.
```

**Incorporate useful feedback** by updating `$PLAN_FILE` in place (Edit tool) before proceeding. Note the review outcome in the plan under a `## Review Notes` section.

### 6. Propose to user before creating issues

Present the (optionally refined) plan to the user:

- Plan log path: `$PLAN_FILE`
- Proposed `impl-title`
- Suggested base branch: `base/{impl-title-slug}`
- List of sub-tasks with dependency notes
- Source issues (if existing-issue mode)
- Review notes (if `-co` was used)

Ask: "Does this look right? Should I adjust anything before creating the issues?"

**Wait for confirmation before proceeding.** If the user requests changes, update `$PLAN_FILE` and re-confirm.

### 7. Create the epic issue

Create the epic first to get its URL.

**Title format:** `[{Impl Title}][Epic] {Feature name}`

Example: `[Team Feature][Epic] Team management and workspace sharing`

**Body must include:**

- One-line description: "This is an epic tracking issue for the **{Impl Title}** implementation."
- Overview of what's being built
- Source issues section (if existing-issue mode): "Supersedes: #A, #B, #C"
- Base branch: `base/{impl-title-slug}` — all sub-issue PRs target this branch
- Note: "Implementation will be done via `/x-wt-teams` — child branches merge into the base branch, which then merges into main as one PR"
- **Sub-issues table** listing all child issues (fill in URLs in Step 9 — or note "see comments below")
- "Close each sub-issue as its implementation is merged."

### 8. Create child issues

Create each sub-issue with `gh issue create`.

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
**Base branch:** `base/{impl-title-slug}` — PR targets this branch, not main.
```

Then update the epic issue body to include the full list of sub-issue URLs (`gh issue edit {epic-number} --body "$(cat <<'EOF' ... EOF)"`).

### 9. Verify original requirements are preserved

**This step is critical.** We've had cases where the original requirements were lost when rearranged into epic + sub-issues. A Sonnet subagent cross-checks the created issues against the original source.

Spawn a `general-purpose` agent with `model: sonnet` via the Agent tool. Prompt it to:

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

Example Agent tool call shape (written out for clarity, not a literal JSON):

- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- `description`: `Verify issues preserve source requirements`
- `prompt`: self-contained prompt with the source, issue numbers, and the report format above

**Handling the report:**

- If **all clear** with no issues, report the verification result to the user and proceed to Step 10.
- If anything is missing/misinterpreted/ambiguous, **fix the issues directly** using `gh issue edit {number} --body "$(cat <<'EOF' ... EOF)"`. Edit the relevant sub-issue (or epic) body to include the missing requirement. Re-spawn the verification agent on the fixed issues to confirm.
- Save the final verification report to `$PLAN_FILE` under a `## Verification Report` section.

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

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

When `-gco` or `--github-copilot` is passed, the following substitutions apply:

| Default tool | GCO replacement | Used for |
|---|---|---|
| `/codex-2nd` | `/gco-2nd` | Step 5 second opinion on plan |
| Agent tool (web search, research) | `/gco-research` | Research during Step 2 exploration |

**How it affects the workflow:**

- **Step 2 (Explore the codebase)**: When you need to research libraries, APIs, or best practices, prefer `/gco-research` over the Agent tool or WebSearch.
- **Step 5 (Second opinion)**: Instead of `/codex-2nd`, invoke `/gco-2nd`. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the Plan subagent fallback.

All other workflow steps (issue creation, verification, etc.) remain unchanged.

## Key Principles

- **No code changes in this session** — planning and issue creation only
- **Save the plan log first** — before codex, before confirmation, before issues. It's the source of truth
- **Confirm before creating** — always show the plan to the user first
- **Verify after creating** — always run the Sonnet verification agent so original requirements aren't lost
- **Small issues win** — an issue that takes 15 agent exchanges is better than one that takes 50
- **Self-contained sub-issues** — each issue body must be readable standalone, without needing this session's context
- **Fresh session next** — always end by instructing the user to start a new session with `/x-wt-teams`
- **No `~` in paths** — always use `$HOME`
