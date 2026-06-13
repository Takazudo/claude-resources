---
name: light-review
description: "Lightweight code review. Dispatches to OpenAI Codex CLI (/codex-review) by default, or to Claude / Copilot depending on flags. Use when: (1) Quick review of a small change, (2) Child agents self-reviewing before reporting to manager, (3) User says 'light review' or 'quick review', (4) Review is needed but /deep-review is overkill. Always operates in PR/diff mode."
argument-hint: "[-haiku|-so|-op] [-co|-gco]"
---

# Light Review

Lightweight code review. Runs whichever reviewers are specified by flags; falls back to the skill's defaults when none are passed.

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md). This is **Claude-only** — the default `/codex-review` backend and `-gco`/`/gco-review` are unavailable, so **default to a Claude reviewer** and ignore `-co`/`-gco`. Read the PR diff and raise any `agent-found` issues via the GitHub MCP, not `gh`.

## Review Focus

- Silly mistakes, bugs, and logic errors
- Missing error handling
- Code quality and readability
- Obvious refactoring opportunities

## Flags

### Model flags (pick at most one — sets Claude model for Claude-based reviewers)

- `-haiku` / `--haiku` — Claude Haiku
- `-so` / `--sonnet` — Claude Sonnet
- `-op` / `--opus` — Claude Opus

If none passed and no backend flag is passed either, the skill falls to the **backend default** (`-co`) — no Claude reviewers run.

If a model flag IS passed, it turns on the Claude-reviewers branch (2 `code-reviewer` subagents at that model).

If multiple model flags are passed, the last one wins.

### Backend flags (combinable — external review tools)

- `-co` / `--codex` — OpenAI Codex CLI (`/codex-review`)
- `-gco` / `--github-copilot` — GitHub Copilot CLI, GPT-5.4 (`/gco-review`)

Multiple backend flags may be combined — each specified backend runs in parallel and findings are consolidated.

**Default for this skill**: `-co` (used when neither a model flag nor any backend flag is passed).

### Flag-resolution summary

| Flags passed | What runs |
|---|---|
| (none) | `/codex-review` only |
| `-op` (or `-so`, `-haiku`) | 2 Claude reviewers at that model |
| `-gco` | `/gco-review` only |
| `-co` | `/codex-review` only |
| `-op -gco` | 2 Opus Claude reviewers **and** `/gco-review` in parallel |
| `-co -gco` | `/codex-review` **and** `/gco-review` in parallel |

## Process

### Step 1: Get the Diff

```bash
BRANCH=$(git branch --show-current)
BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)
```

If no PR exists, use the default branch:

```bash
BASE=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
```

```bash
git diff "$BASE"...HEAD
```

### Step 2: Dispatch Reviewers in Parallel

Based on the flags, launch every selected reviewer in the **same message** (parallel).

#### Claude branch (only when a model flag is passed)

Launch 2 `code-reviewer` subagents with `model` set to `haiku` / `sonnet` / `opus` per the model flag.

**Reviewer 1: Bugs & Logic**

```
Review the code changes focusing on:
1. Logic errors, typos, incorrect implementations
2. Missing null checks, off-by-one errors
3. Broken functionality, incorrect API usage
4. Error handling issues

Be concise. Only flag real problems, not style preferences.

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 3 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 2: Quality & Structure**

```
Review the code changes focusing on:
1. Code duplication (DRY violations)
2. Overly complex code that can be simplified
3. Type safety issues
4. Performance concerns (unnecessary re-renders, missing memoization)
5. Better patterns or abstractions

Be concise. Only flag real problems, not style preferences.

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 3 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

#### Backend branch (only when a backend flag is passed)

For each specified backend, invoke the matching skill in parallel (single message, multiple tool calls):

- `-co` → `Skill(skill="codex-review")` — silently falls back to **Opus** (2 `code-reviewer` subagents at `model: opus`) if codex is rate-limited
- `-gco` → `Skill(skill="gco-review")`

Each backend skill already handles its own rate-limit / fallback behavior silently. For `-co`, that fallback is Opus — the user picked `-co` to mean "the better reviewer," and Opus is the Claude-side stand-in when codex is down.

#### Default (no flags)

Equivalent to `-co`. Invoke `/codex-review` only.

**CRITICAL: Launch all reviewers (Claude + backend) in parallel in a single message.**

### Step 3: Synthesize and Apply

After all reviewers complete (each returns high-priority items + log path):

1. Merge and deduplicate findings across all reviewers (Claude + backends)
2. Categorize by priority (high / medium / low)
3. If more detail is needed on a finding, read the reviewer's log file
4. Apply high-priority fixes automatically
5. Apply medium-priority fixes if clearly safe
6. Skip low-priority and style-only suggestions

### Step 4: Commit Fixes

If fixes were applied, commit them with a descriptive message.

## Important Notes

- This is a **lightweight** review — keep it fast. The goal is a quick sanity check, not a deep audit.
- Reviewers save full findings to log files, return only high-priority items + path.
- For thorough review (3–6 reviewers), use `/deep-review` instead.
- Log files are available via `/logrefer` for future sessions.
