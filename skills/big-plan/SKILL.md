---
name: big-plan
description: "Planning skill for breaking down a large feature into an epic GitHub issue + child sub-issues. Use when: (1) User says '/big-plan', (2) User wants to plan a big implementation before coding, (3) User wants to split a feature into small issues for parallel agent team work. This skill does PLANNING ONLY — no code changes. Output: epic issue + child issues on GitHub, then instruct the user to start a fresh session with /x-wt-teams."
argument-hint: <description of what you want to implement>
---

# Big Plan

Planning-only skill. Explore the codebase, propose a breakdown, create GitHub issues, then hand off to `/x-wt-teams` in a fresh session.

## Workflow

### 1. Understand the task

Read the user's description of what they want to implement. If vague, ask one clarifying question before exploring.

### 2. Explore the codebase

Do a thorough exploration of all relevant code. Read existing patterns, understand the architecture, identify what files will need to change and what new ones will be created. Be comprehensive — this is the expensive step that justifies a dedicated session.

### 3. Draft the plan

Break the implementation into sub-tasks that are:

- **Small** — completable in a single focused agent session (ideally under 20 tool calls)
- **Independent** — ideally parallelizable, or with clear sequential dependencies
- **Concrete** — scope is specific enough that an agent can start without asking questions

Identify the dependency order (which must come first, which can run in parallel).

### 4. Propose to user before creating issues

Present the planned breakdown to the user:

- Proposed `impl-title` (see naming below)
- Suggested base branch: `base/{impl-title-slug}`
- List of sub-tasks with dependency notes

Ask: "Does this look right? Should I adjust anything before creating the issues?"

**Wait for confirmation before proceeding.**

### 5. Create the epic issue

Create the epic issue first to get its URL.

**Title format:** `[{Impl Title}][Epic] {Feature name}`

Example: `[Team Feature][Epic] Team management and workspace sharing`

**Body must include:**

- One-line description: "This is an epic tracking issue for the **{Impl Title}** implementation."
- Overview of what's being built
- Base branch: `base/{impl-title-slug}` — all sub-issue PRs target this branch
- Implementation will be done via `/x-wt-teams` — child branches merge into the base branch, which then merges into main as one PR
- **Sub-issues table** listing all child issues (fill in URLs after creating them — or note "see comments below")
- "Close each sub-issue as its implementation is merged."

### 6. Create child issues

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

### 7. Update epic issue with sub-issue links

After all child issues are created, edit the epic issue body to include the full list of sub-issue URLs.

Use `gh issue edit {epic-number} --body "$(cat <<'EOF' ... EOF)"` to update.

### 8. End the session

Print a summary:

```
## Plan complete

Epic: {epic-url}

Sub-issues:
- {url} — {title}
- {url} — {title}
...

Base branch: base/{impl-title-slug}

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

## Key Principles

- **No code changes in this session** — planning and issue creation only
- **Confirm before creating** — always show the plan to the user first
- **Small issues win** — an issue that takes 15 agent exchanges is better than one that takes 50
- **Self-contained sub-issues** — each issue body must be readable standalone, without needing this session's context
- **Fresh session next** — always end by instructing the user to start a new session with `/x-wt-teams`
