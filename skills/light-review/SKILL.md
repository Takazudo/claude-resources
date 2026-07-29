---
name: light-review
description: "Lightweight code review. Dispatches to OpenAI Codex CLI (/codex-review) by default, or to Claude depending on flags. Use when: (1) Quick review of a small change, (2) Child agents self-reviewing before reporting to manager, (3) User says 'light review' or 'quick review', (4) Review is needed but /deep-review is overkill. Always operates in PR/diff mode."
argument-hint: "[-haiku|-so|-op] [-co]"
---

# Light Review

Lightweight code review. Runs whichever reviewers are specified by flags; falls back to the skill's defaults when none are passed.

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md). This is **Claude-only** — the default `/codex-review` backend is unavailable, so **default to a Claude reviewer** and ignore `-co`. Read the PR diff and raise any `agent-found` issues via the GitHub MCP, not `gh`.

> **Subagent safety**: when this skill runs inside a subagent (a worktree child, a team member, or any agent instructed to review in the foreground), **every backend must execute in blocking/foreground form** — a subagent that backgrounds a review and then waits for a completion notification parks forever, because that notification is only delivered to the parent/manager session.
>
> - **`-co` backend**: safe automatically. `Skill(skill="codex-review")` executes on the *same invoking agent* — so it inherits that agent's context, and codex-review's own "Subagent / child-agent context (MANDATORY)" rule takes over, running codex as a single foreground Bash call instead of a background task. Nothing extra to do here.
> - **Claude branch** (`-haiku` / `-so` / `-op`, `code-reviewer` subagents): **NOT automatically park-safe** — this is the trap, not the escape from it. A nested `Agent` call returns an **async handle even with `run_in_background: false`**, and its completion notification routes to the **manager**, not to the subagent that spawned it. So the branch is context-scoped by *mechanism*, not merely by reviewer count:
>   - **Manager / interactive context**: spawn **2** `code-reviewer` subagents at the flagged model. Notifications land here, so this is safe.
>   - **Subagent / child-agent context**: spawn **NOTHING**. Review the diff yourself in the foreground (see Step 2). Dispatching even one nested `code-reviewer` and then ending your turn parks you forever. This also sidesteps the CPU budget — up to 6 live children each spawning nested reviewers would blow the manager's 6-concurrent budget.
>
>   Canonical rule: **a subagent must never end its turn waiting on anything it did not itself synchronously complete** — see `$HOME/.claude/skills/x-wt-teams/references/execution-modes.md` → "Invariant". (An earlier version of this note claimed `Agent` calls block and return synchronously and were therefore park-proof. That was false and caused real parked children.)

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

If a model flag IS passed, it turns on the Claude-reviewers branch (2 `code-reviewer` subagents at that model in the manager/interactive context; a foreground self-review spawning no subagent in a subagent/child-agent context — see Step 2).

If multiple model flags are passed, the last one wins.

### Backend flags (combinable — external review tools)

- `-co` / `--codex` — OpenAI Codex CLI (`/codex-review`)

Multiple backend flags may be combined — each specified backend runs in parallel and findings are consolidated.

**Default for this skill**: `-co` (used when neither a model flag nor any backend flag is passed).

### Flag-resolution summary

| Flags passed | What runs |
|---|---|
| (none) | `/codex-review` only |
| `-op` (or `-so`, `-haiku`) | 2 Claude reviewers at that model (in a subagent/child-agent context: foreground self-review, no subagent) |
| `-co` | `/codex-review` only |

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

**This branch is context-scoped by mechanism, not just by reviewer count** (see the "Subagent safety" note at the top of this file):

- **Manager / interactive context**: launch **2** `code-reviewer` subagents (Reviewer 1 + Reviewer 2 below) with `model` set to `haiku` / `sonnet` / `opus` per the model flag. Launch both in parallel and collect their results in this turn before synthesis.
- **Subagent / child-agent context** (a worktree child, a team member, or any agent told to review in the foreground): launch **NO subagent at all**. Read `git diff "$BASE"...HEAD` and do both passes yourself, in the foreground — one Bugs & Logic pass, one Quality & Structure pass over the changed files — then apply clearly-useful fixes and commit.

  Use only the **numbered focus lists** from the two prompt blocks below as your checklists. **Ignore their `REPORTING:` sections** — "return to the caller" and "the log file path" describe a subagent handing results back, which does not apply when you are the reviewer. Your findings go straight into your own fixes, and your completion report to the manager states that the self-review ran in the foreground and findings were applied (or none found).

  Why no subagent: a nested `Agent` call returns an async handle even with `run_in_background: false`, and its completion notification routes to the **manager**, so a child that spawns one and ends its turn parks with work committed but never reported (`$HOME/.claude/skills/x-wt-teams/references/execution-modes.md` → "Invariant"). It also keeps the CPU budget sane — 6 concurrent children each spawning nested reviewers would blow the manager's 6-concurrent budget.

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

- `-co` → `Skill(skill="codex-review")` — falls back silently if codex is rate-limited: to **Opus** (2 `code-reviewer` subagents at `model: opus`) in the manager context, or to a **foreground self-review spawning nothing** in a subagent/child-agent context

Each backend skill already handles its own rate-limit / fallback behavior silently, including the context split above. For `-co` in the manager context that fallback is Opus — the user picked `-co` to mean "the better reviewer," and Opus is the Claude-side stand-in when codex is down.

#### Default (no flags)

Equivalent to `-co`. Invoke `/codex-review` only.

**CRITICAL: Launch all reviewers (Claude + backend) in parallel in a single message.** In a subagent/child-agent context there are no Claude reviewers to launch — you do that branch yourself in the foreground — so this applies only to the backend invocation.

### Step 3: Synthesize and Apply

After all reviewers complete (each returns high-priority items + log path; in a child context, "reviewers" means your own foreground passes):

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
