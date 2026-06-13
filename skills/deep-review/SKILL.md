---
name: deep-review
description: "Deep code quality review focused on structure, refactoring, and best practices. Use when: (1) User says 'review', 'deep review', or 'code review', (2) After implementation when a quality check is needed, (3) Before marking a PR as ready. Default backend is /codex-review. Opt into Claude reviewers with -haiku|-so|-op (auto-detects PR vs full-project mode). Supports -co|-gco external backends. Default team-fix mode (-t) delegates fixes to /x-wt-teams --no-review --stay; pass -nt/--no-team for inline fixes. Unfixed findings become agent-found GitHub issues by default (-nori to suppress)."
argument-hint: "[-haiku|-so|-op] [-co|-gco] [-t|-nt] [-ri|--raise-issues] [-nori|--no-raise-issues]"
---

# Deep Review

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md). This is **Claude-only** — the default `/codex-review` backend and `-gco`/`/gco-review` are unavailable, so **default to a Claude reviewer** and ignore `-co`/`-gco`. The default `-t` team-fix mode does **not** use agent teams here: fan out **subagents** for fixes instead of delegating to `/x-wt-teams`. Read the diff and raise `agent-found` issues via the GitHub MCP, not `gh`.

Perform a practical code quality review with priorities:

**PRIMARY FOCUS (most important):**

- Silly mistakes and bugs
- Refactoring opportunities
- Structural and architectural issues
- File organization and naming
- Better coding patterns and practices

**SECONDARY FOCUS (still useful to point out):**

- Security issues (XSS, injection, etc.)
- Validation concerns

## Flags

**Default (no flags):** delegate to `/codex-review` — see Step 1.

### Model flags (pick at most one — enables Claude reviewers and sets the model)

- `-haiku` / `--haiku` — Claude Haiku
- `-so` / `--sonnet` — Claude Sonnet
- `-op` / `--opus` — Claude Opus 4.8 (Anthropic's top model; runs with a 1M-token context window)

Passing any model flag opts in to the full Claude reviewer workflow (3 reviewers on a PR diff, 6 reviewers on a full project scan) and sets the `model:` field for every `code-reviewer` subagent spawned in Steps A-2 / B-2.

If multiple model flags are passed, the last one wins.

### Backend flags (combinable — external reviewers run in parallel)

- `-co` / `--codex` — **default strategy.** Alone (or with no flags at all), delegates to `/codex-review`. Combined with a Claude model flag, prefer the OpenAI Codex side-by-side review. If codex is rate-limited or otherwise unavailable, **silently fall back to Opus** (delegated via `/codex-review`, which spawns 2 `code-reviewer` subagents at `model: opus`). The user's choice of `-co` means "give me the better reviewer" — codex when up, Opus when not. Never surface the rate limit, never pause.
- `-gco` / `--github-copilot` — also invoke `/gco-review` (GPT-5.4) in parallel with the Claude reviewers

When a Claude model flag is passed, codex side-by-side runs opportunistically (see Steps A-2b / A-2c / B-2b / B-2c). `-co` upgrades this from "opt-in when not rate-limited" to "always run a codex-equivalent reviewer — codex when up, Opus when down". `-gco` adds an additional external reviewer alongside Claude reviewers.

Multiple backend flags combine — every specified backend runs in parallel and all findings consolidate in Step 3.

### Team-fix flags (default `-t`)

- `-t` / `--team` — **DEFAULT.** After review findings are presented, delegate the fix work to a fresh `/x-wt-teams --no-review -nf -nori --stay` session so the manager context stays light. The team session creates a worktree, spawns a fix agent, commits, merges back into the current branch, and pushes. **Recursion-safe** because the inner `/x-wt-teams` is invoked with `--no-review` (skips its own Step 9, preventing an infinite review-fix loop) plus `-nf -nori` (suppresses its auto-fix and issue-raising defaults — the outer `/deep-review` owns both).
- `-nt` / `--no-team` — Opt out of team-fix mode. Apply fixes inline in the manager context (legacy behavior — Steps 5/6/7 below). Use this when you are calling `/deep-review` from a context that already has its own fix delegation, when there is no PR / branch to merge into, or when the change is too small to justify the worktree machinery.

If both flags are passed, the last one wins. Team-fix only runs when findings are actually actionable — if the review reports "no issues," Steps 5–8 are skipped regardless of the flag.

### Issue-raising flags (default `-ri`)

- `-ri` / `--raise-issues` — **DEFAULT.** After the fix pass, raise a GitHub issue (label `agent-found`) for each finding that was presented but not fixed — deferred needs-consideration items and out-of-scope problems reviewers noticed. See Step 8. Pass explicitly for clarity; behavior is identical to the default.
- `-nori` / `--no-raise-issues` — Suppress issue creation; unfixed findings stay in the terminal report only. **Callers that own their own issue-raising pass this** — e.g. `/review-loop` collects deferred findings across rounds and raises them once at its end, so it invokes `/deep-review -nt -nori` to keep a single raise-owner per session.

## Review Process

### Step 1: Resolve Strategy

**Default strategy — delegate to `/codex-review`.**

If the invocation has **no flags**, or only the `-co` / `--codex` flag, delegate to `/codex-review` and return its findings. Do NOT spawn Claude reviewers, do NOT run the codex side-by-side pre-flight, and do NOT continue with Steps A-1 / B-1:

```
Skill(skill="codex-review")
```

`/codex-review` already handles PR-vs-default-branch detection internally (and silently falls back to Opus if codex is rate-limited), so the rest of this workflow can be skipped in the default case. Once it returns, jump straight to **Step 3: Synthesize Review Results** to present its findings, then proceed to Step 4 (Present Findings) and Step 5 (which branches on `-t` / `-nt`). Team-fix mode applies regardless of how the review was produced — `/codex-review` findings get the same `-t` delegation treatment as Claude-reviewer findings.

**Only continue below when a Claude model flag (`-haiku` / `-so` / `-op`) or the `-gco` backend flag was passed.** Those flags opt in to the Claude reviewer workflow; `-co` can still be combined with them to guarantee the codex side-by-side reviewer in Steps A-2b / A-2c / B-2b / B-2c.

### Step 2: Determine Review Mode

**CRITICAL: Decide between a branch-diff review and a full-project scan by asking "does this branch have changes against a base?" — NOT "does a PR exist?".** A feature branch with commits ahead of its base but no PR yet must still be reviewed as a diff of its own changes, not as a whole-project scan. Keying off PR existence is the bug that makes `/review-loop` on a no-PR branch feel like it "reviews from main": the whole repo gets scanned instead of the branch's work.

1. **Resolve the current branch and its base — same logic the external backends (`/codex-review`, `/gco-review`) use, and the same parent resolution as `/x-wt-teams --stay`:**

   ```bash
   BRANCH=$(git branch --show-current)
   DEFAULT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
   BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)
   [ -z "$BASE" ] && BASE="$DEFAULT_BRANCH"   # no PR → fall back to repo default branch
   ```

   `$BASE` is consumed by the diff in Step A-1 and the codex `--base "$BASE"` companions in Steps A-2b/A-2c.

2. **PR Review Mode (Mode A — 3 reviewers, diff-based)** — use when the branch is NOT the default branch **and** has commits against `$BASE`:

   ```bash
   git diff --quiet "$BASE"...HEAD || HAS_CHANGES=1   # HAS_CHANGES=1 means there is a diff to review
   ```

   When `$BRANCH` ≠ `$DEFAULT_BRANCH` and `HAS_CHANGES=1`, review `git diff $BASE...HEAD`:

- With a PR: "Found PR #X targeting `$BASE`, reviewing changes against that branch"
- Without a PR: "On branch `$BRANCH` with no PR — reviewing its diff against `$BASE` (the branch's own changes), not the whole project"

3. **Full Project Review Mode (Mode B — 6 reviewers, whole-project scan)** — use **only** when on the default branch, or when the branch has no changes against `$BASE` (nothing to diff):

- "On default branch / no branch changes — running full project review"

---

## Mode A: PR Review (3 Reviewers)

### Step A-1: Get the Diff

```bash
git diff "$BASE"...HEAD
```

`$BASE` was resolved in Step 2 (PR base if a PR exists, else the repo default branch).

### Step A-2: Run 3 Parallel Reviews

**Use Task tool with `subagent_type: "code-reviewer"` and `model` set to the resolved model flag (default `"opus"`) THREE times in parallel**

**Reviewer 1: Bugs & Logic**

```
Review the code changes focusing on:

PRIMARY FOCUS:
1. Silly mistakes and bugs (logic errors, typos, incorrect implementations)
2. Missing null checks, off-by-one errors
3. Incorrect API usage, broken functionality
4. Error handling issues

LOG FILENAME: Use 'bugs' as your log filename slug (e.g., reviewer-bugs-{pr-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 2: Structure & Refactoring**

```
Review the code changes focusing on:

PRIMARY FOCUS:
1. Code duplication (DRY violations)
2. Overly complex code that can be simplified
3. Structural and architectural issues
4. Component organization and hierarchy
5. State management problems
6. File organization and naming
7. Better abstractions or patterns

LOG FILENAME: Use 'structure' as your log filename slug (e.g., reviewer-structure-{pr-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 3: Quality & Best Practices**

```
Review the code changes focusing on:

PRIMARY FOCUS:
1. Type safety and TypeScript usage
2. Performance (React re-renders, memoization)
3. Accessibility issues
4. Code readability and maintainability
5. Better coding patterns

SECONDARY:
- Security issues (XSS, injection, validation)

LOG FILENAME: Use 'quality' as your log filename slug (e.g., reviewer-quality-{pr-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**CRITICAL: Launch all 3 code-reviewer subagents in PARALLEL in a single message using the resolved model (default Opus; override via `-haiku` / `-so` / `-op`).**

### Step A-2b: Run Codex Review in Parallel (if not rate-limited)

**Gate logic:**

- If `-co` / `--codex` was passed → **prefer codex, fall back to Opus silently**. Still run the pre-flight check; if `RATE_EXIT` is non-zero, do NOT launch the codex companion. Instead, spawn the codex-equivalent fallback for this step: 2 `code-reviewer` subagents with `model: opus` reviewing the diff against `$BASE`. Treat their findings as the codex side-by-side input in Step 3 synthesis. (For Step A-2c, see its own fallback note.) Never surface the rate limit, never pause.
- Otherwise → run the **opportunistic pre-flight check**:

  ```bash
  RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
  RATE_EXIT=$?
  ```

  If `RATE_EXIT` is non-zero, **silently skip ALL codex steps** (A-2b and A-2c). Do NOT report the rate limit to the user — just proceed with Claude Code reviewers only. (No Opus fallback in this branch — the user did not explicitly request codex-tier coverage.)

**In addition to** the 3 Claude Code reviewers above, also launch a codex review in parallel as a background Bash task. This provides a cross-model perspective on the same diff:

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-review-local.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-local-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` so it runs concurrently with the Claude Code subagents. The `--wait` flag ensures the companion script blocks until the review completes (so output is captured), while `run_in_background` ensures Claude Code doesn't wait for it before launching the subagents.

- If codex plugin is not installed or codex times out or produces no output, proceed with Claude Code reviewers' results only
- If codex produces findings, include them in the synthesis step alongside Claude Code reviewer results

### Step A-2c: Run Codex Adversarial Review in Parallel

**Gate logic:** same `-co` / opportunistic split as Step A-2b. When `-co` was passed AND codex is rate-limited, spawn 1 additional `code-reviewer` subagent with `model: opus` and an **adversarial prompt** ("challenge the design / architecture / tradeoffs, not the implementation defects") as the codex-adversarial stand-in. Without `-co`, silently skip on rate-limit.

**In addition to** the standard codex review above, also launch an adversarial review as a separate background Bash task. This challenges the design choices, assumptions, and tradeoffs — complementing the standard review which focuses on implementation defects:

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script (pick latest version if multiple exist)
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" adversarial-review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-adversarial-review-local.md" \
  2>"$LOGDIR/${DATETIME}-codex-adversarial-review-local-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` — same as the standard codex review. Both codex reviews run concurrently with each other and with the Claude Code subagents.

- The adversarial review questions the approach, architecture, and design tradeoffs
- The standard review (Step A-2b) catches implementation bugs and defects
- Together they provide comprehensive cross-model coverage
- If codex fails or times out, proceed with other reviewers' results only

### Step A-2d: Run GitHub Copilot Review in Parallel (if `-gco` passed)

If `-gco` / `--github-copilot` was passed, invoke `/gco-review` in parallel with the Claude and codex reviewers:

```
Skill(skill="gco-review")
```

`/gco-review` already silently falls back to Claude-based reviewers if Copilot is rate-limited — no extra handling needed. Its findings consolidate in Step 3 along with the other reviewers.

---

## Mode B: Full Project Review (6 Reviewers)

When on the default branch (or the branch has no changes against `$BASE`), perform a comprehensive review of the **entire project**. Note: a non-default branch with commits ahead of `$BASE` but no PR still uses Mode A — see Step 2.

### Step B-1: Understand the Project

Before launching reviewers, gather project context:

```bash
ls -la
cat package.json 2>/dev/null || cat Cargo.toml 2>/dev/null || cat go.mod 2>/dev/null || true
```

Read the project's CLAUDE.md, README, or similar to understand the project structure.

### Step B-2: Run 6 Parallel Reviews

**Use Task tool with `subagent_type: "code-reviewer"` and `model` set to the resolved model flag (default `"opus"`) SIX times in parallel**

Each reviewer explores the entire codebase independently, focusing on their assigned area.

**Reviewer 1: Bugs & Logic Errors**

```
Review the ENTIRE project codebase for bugs and logic errors:

1. Logic errors, off-by-one, incorrect conditions
2. Null/undefined access, unhandled edge cases
3. Race conditions, async/await mistakes
4. Incorrect API usage or broken integrations
5. Silent failures, swallowed errors
6. Dead code that hides bugs

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and fix suggestions.

LOG FILENAME: Use 'bugs' as your log filename slug (e.g., reviewer-bugs-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 2: Architecture & Structure**

```
Review the ENTIRE project codebase for architectural and structural issues:

1. Poor module/file organization
2. Circular dependencies
3. God objects/files doing too much
4. Missing separation of concerns
5. Inconsistent patterns across the codebase
6. Misplaced logic (business logic in UI, etc.)
7. Naming inconsistencies (files, functions, variables)

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and improvement suggestions.

LOG FILENAME: Use 'architecture' as your log filename slug (e.g., reviewer-architecture-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 3: Code Quality & Refactoring**

```
Review the ENTIRE project codebase for refactoring opportunities:

1. Code duplication (DRY violations)
2. Overly complex functions that should be broken down
3. Deep nesting that can be flattened
4. Magic numbers/strings that should be constants
5. Poor abstractions or missing abstractions
6. Unnecessary complexity or over-engineering
7. Functions/methods that are too long

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and refactoring suggestions.

LOG FILENAME: Use 'refactoring' as your log filename slug (e.g., reviewer-refactoring-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 4: Type Safety & Correctness**

```
Review the ENTIRE project codebase for type safety and correctness:

1. Missing or incorrect types (any, unknown, type assertions)
2. Unsafe type casts
3. Missing generics where they would help
4. Incorrect interface/type definitions
5. Missing validation at system boundaries
6. Data flow issues (wrong data passed between components)

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and fix suggestions.

LOG FILENAME: Use 'types' as your log filename slug (e.g., reviewer-types-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 5: Performance & Resource Management**

```
Review the ENTIRE project codebase for performance issues:

1. Unnecessary re-renders (React) or recomputations
2. Missing memoization where needed
3. N+1 queries or inefficient data fetching
4. Memory leaks (event listeners, subscriptions, timers)
5. Large bundle size contributors
6. Blocking operations on main thread
7. Inefficient algorithms or data structures

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and optimization suggestions.

LOG FILENAME: Use 'performance' as your log filename slug (e.g., reviewer-performance-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 6: Security & Robustness**

```
Review the ENTIRE project codebase for security and robustness issues:

1. XSS vulnerabilities (unsanitized user input in HTML)
2. Injection risks (SQL, command, path traversal)
3. Hardcoded secrets, API keys, or credentials
4. Missing input validation
5. Insecure defaults or configurations
6. Missing CSRF/CORS protections
7. Exposed sensitive data in logs or error messages
8. Dependency vulnerabilities

Explore all source files thoroughly. Provide specific findings with file paths, line numbers, and fix suggestions.

LOG FILENAME: Use 'security' as your log filename slug (e.g., reviewer-security-{project-context}).

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 5 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**CRITICAL: Launch all 6 code-reviewer subagents in PARALLEL in a single message using the resolved model (default Opus; override via `-haiku` / `-so` / `-op`).**

### Step B-2b: Run Codex Review in Parallel (if not rate-limited)

**Gate logic:** same as Step A-2b — if `-co` / `--codex` was passed and codex is rate-limited, **silently fall back to Opus** (spawn 1 `code-reviewer` subagent with `model: opus` doing a full-project pass — same prompt as the codex `task` below). Without `-co`, use the silent `codex-rate-limit.js check` gate and skip on non-zero exit (no fallback).

**In addition to** the 6 Claude Code reviewers above, also launch a codex review in parallel as a background Bash task:

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" task \
  "Review the entire codebase for bugs, logic errors, structural issues, and quality. Be concise." \
  > "$LOGDIR/${DATETIME}-codex-review-local-full.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-local-full-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` so it runs concurrently with the Claude Code subagents. Uses `task` (not `review`) because full-project mode needs a custom prompt — the companion's `review` command only supports branch/working-tree diffs.

- If codex plugin is not installed or codex times out or produces no output, proceed with Claude Code reviewers only
- Include codex findings in synthesis if available

### Step B-2c: Run Codex Adversarial Review in Parallel

**Gate logic:** same `-co` / opportunistic split as Step B-2b. When `-co` was passed AND codex is rate-limited, spawn 1 additional `code-reviewer` subagent with `model: opus` and an **adversarial prompt** (challenge architecture / design decisions across the full codebase) as the codex-adversarial stand-in. Without `-co`, silently skip on rate-limit.

**In addition to** the standard codex task above, also launch an adversarial review as a separate background Bash task:

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script (pick latest version if multiple exist)
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" adversarial-review --wait \
  > "$LOGDIR/${DATETIME}-codex-adversarial-review-local-full.md" \
  2>"$LOGDIR/${DATETIME}-codex-adversarial-review-local-full-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)`. Runs concurrently with the standard codex task and Claude Code subagents.

- Challenges architecture, design decisions, and assumptions across the full codebase
- If codex fails or times out, proceed with other reviewers' results only
- Include findings in synthesis if available

### Step B-2d: Run GitHub Copilot Review in Parallel (if `-gco` passed)

Same pattern as A-2d:

- `-gco` → `Skill(skill="gco-review")` in parallel with the other reviewers

It silently falls back if Copilot is rate-limited. Findings consolidate in Step 3.

---

## Post-Review Steps (both modes)

### Step 3: Synthesize Review Results

**Default path (`/codex-review` only):** `/codex-review` already returns a consolidated report — skip this step and go straight to Step 4.

**Flag-driven path (Claude reviewers + optional backends):** after receiving review results from the code-reviewer subagents and any external backends (each returns high-priority items + log path):

1. **Merge and deduplicate findings** from all reviewers' brief returns
2. **Categorize all findings by priority**
3. **Note reviewer consensus** (findings flagged by multiple reviewers are higher priority)
4. **If more detail is needed** on a specific finding, read the reviewer's log file via the returned path
5. **Collect all log file paths** for reference

### Step 4: Present Findings to User

Present a clear summary synthesized from all reviewers. Include log file paths so the user (or a future session via `/logrefer`) can access the full analysis.

If the review reports **no actionable issues**, stop here — Steps 5–8 are skipped regardless of `-t` / `-nt`.

### Step 5: Apply Fixes — branch on team-fix mode

The fix path depends on whether `-t` (default) or `-nt` was active.

#### Step 5a: Team-fix mode (`-t`, DEFAULT)

When the team-fix flag is on (the default), do NOT apply fixes inline. Instead, hand the findings off to a fresh `/x-wt-teams --no-review -nf -nori --stay` session that creates a worktree, spawns a fix agent, commits, merges back into the current branch, and pushes.

**Why this exists:** the manager that just ran the review is already token-heavy from collecting findings. Doing the fixes inline grows that context further. Delegating to `/x-wt-teams --no-review --stay` keeps the fix work in fresh subagent contexts and reuses the existing worktree / merge / push / CI machinery.

**Recursion guard:** the inner `/x-wt-teams` MUST be invoked with `--no-review -nf -nori`. `--no-review` skips its Step 9 — without it the inner session would call `/deep-review` again (which defaults back to `-t`), spawning another `/x-wt-teams`, ad infinitum. `-nf -nori` suppress the inner session's own auto-fix and issue-raising defaults — this is a contained fix session for findings the outer `/deep-review` already owns; without them the inner session would open `agent-fix/<slug>` PRs the outer session never tracks and become a second issue-raise owner (this `/deep-review`'s Step 8 is the single raise-owner). **Always pass all three, never omit them.**

**Procedure:**

1. **Build the fix instructions block.** Combine the high-priority and medium-priority findings into a single instruction string, with file paths and line numbers, grouped by area or severity. Keep low-priority findings out unless the user explicitly asked for an aggressive pass.

   **Workspace package rebuild rule (must include in the brief when applicable).** If the project has a workspace/monorepo layout (check the repo's `CLAUDE.md` and/or `pnpm-workspace.yaml` / `package.json` `workspaces` field) and any finding's file path lives inside a workspace package whose consumer imports through a built artifact (e.g. an `exports` map → `./dist/...`), append an explicit rebuild checklist item to the fix instructions, listing the affected packages by name and the rebuild command the project uses. Example wording to forward:

   > After applying the source fixes, rebuild each touched workspace package (e.g. `pnpm --filter <name> build`) and commit the resulting build output in the same PR. The package is consumed through its built artifact, so a missing rebuild leaves the consumer importing stale compiled output. Skip only if the package has no build step. A failed build is a blocker.

   Without this, the inner `/x-wt-teams` fix agent may commit source-only changes and ship a stale-dist bug. When the project's `CLAUDE.md` names the workspace root and rebuild command, defer to it; otherwise, infer from the repo layout.

2. **Capture the current branch** as the merge target — `/x-wt-teams --stay` will treat this branch as its base:

   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   ```

3. **Invoke `/x-wt-teams --no-review -nf -nori --stay <fix-instructions>`** as the next action. Forward the same reviewer flags (`-haiku|-so|-op`, `-co|-gco`) that this `/deep-review` invocation received — the inner session's `--no-review` skips its own manager-level Step 9, but the child agent's `/light-review` self-check still runs and uses those reviewer flags to stay consistent. `-nf -nori` keep the inner session from auto-fixing or raising issues on its own (see the recursion guard above).

   **Fix-agent model**: `/x-wt-teams`'s team-member flags are `-t-op` / `-t-so` (default `opus`). If `/deep-review` was given `-so` or `-haiku` to save tokens on reviewers and you want the fix-agent to run at the same tier, also pass `-t-so`. Without a team-member flag, the fix-agent defaults to opus.

   **Single fix topic by default.** Bundle all findings into ONE topic so the inner session spawns a single fix agent in a single worktree. Multiple parallel fix topics would risk conflicting edits on overlapping files. If the findings are genuinely independent and span clearly separate file sets, you may split into multiple topics — but the default is one.

   Concrete invocation:

   ```
   Skill(skill="x-wt-teams", args="--no-review -nf -nori --stay <forwarded reviewer flags> [-t-op|-t-so if fix-agent model needs control] Fix the review findings listed below. Single topic — apply all fixes in one worktree. <fix instructions including file paths, line numbers, what to change and why>")
   ```

4. **Wait for `/x-wt-teams` to complete.** When it returns, the fixes are already merged into `CURRENT_BRANCH`, pushed, and (if applicable) the root PR is updated. There is **NO Step 6 / Step 7 to run** in team-fix mode — `/x-wt-teams` already handled commits, push, and PR revise inside its own workflow.
5. **Do NOT run `/deep-review` again** to verify the fixes. That would re-trigger another `-t` cycle and loop forever. The team session's own child self-review (`/light-review`) is the verification pass — trust it and stop.

After `/x-wt-teams` returns, proceed to Step 8 (raise issues for unfixed findings), then end the `/deep-review` session.

#### Step 5b: Inline fix mode (`-nt`)

When `-nt` was passed, apply fixes directly in the current manager context (legacy behavior).

For **High Priority** fixes:

- Implement automatically without asking

For **Medium Priority** fixes:

- If clearly useful and safe -> implement
- If uncertain about value/impact -> defer (Step 8 raises it as an issue)

For **Low Priority** fixes:

- Defer by default (Step 8); implement only if the user explicitly asked for an aggressive pass

Then proceed to Steps 6–8 below.

### Step 6: Commit Changes (`-nt` only)

After applying fixes inline:

1. Run type check: `npm run typeCheck`
2. Create a descriptive commit message listing all fixes
3. Use the standard commit format with footer

### Step 7: Revise PR (`-nt` only, PR mode only)

If this was a PR review (Mode A) and fixes were committed:

1. Invoke `/pr-revise` to update the PR title and description
2. This ensures the PR metadata reflects the full implementation including the review fixes
3. Skip this step if no fixes were applied or if running in full project mode (Mode B)

In team-fix mode (`-t`), `/x-wt-teams` runs its own `/pr-revise` at Step 13, so this step is not needed here.

### Step 8: Raise Issues for Unfixed Findings (default `-ri`, both fix modes)

Skip entirely if `-nori` was passed, or if every presented finding was fixed.

Findings presented in Step 4 but not fixed — deferred needs-consideration items (design/product decisions, behavior changes, schema changes), findings left out of the team-fix instructions, items the fix pass could not apply, and out-of-scope problems reviewers noticed — become GitHub issues so the decision they need isn't lost when the session ends:

1. Ensure the label exists (idempotent): `gh label create agent-found --color D93F0B --description "Found by agent during automated work" 2>/dev/null || true`
2. Check open `agent-found` issues first (`gh issue list --label agent-found --state open`) and skip findings already tracked — repeated reviews must not re-raise duplicates.
3. Create one issue per distinct finding (group tightly-related ones), with `file:line` references, what the reviewer found, and why the fix was deferred.
4. List the created issue URLs in the final report.

Fixed findings never get issues — the commit is the record.

## Important Notes

- **Default strategy:** `/codex-review`. The Claude reviewer workflow is opt-in via `-haiku` / `-so` / `-op`.
- **Default fix strategy:** `-t` team-fix mode. After findings are presented, the actual fix work is delegated to `/x-wt-teams --no-review -nf -nori --stay`. Pass `-nt` / `--no-team` to keep fixes inline. The guard flags on the inner `/x-wt-teams` are mandatory: `--no-review` (recursion), `-nf -nori` (the inner session must not auto-fix or raise issues — the outer session owns both) — never omit them.
- **Unfixed findings become `agent-found` issues by default (`-ri`, Step 8).** `-nori` keeps them terminal-only; orchestrators that raise issues themselves (`/review-loop`) pass `-nori` so each session has exactly one raise-owner.
- **CRITICAL (flag-driven path):** when a Claude model flag is passed, all reviews MUST be launched in parallel in a single message using the resolved model
- **Mode selection keys off branch changes, not PR existence:** any non-default branch with commits ahead of `$BASE` gets a diff review (Mode A) even without a PR. Full-project scan (Mode B) is reserved for the default branch or a branch with nothing to diff. This keeps `/review-loop` anchored to the current branch's work instead of scanning the whole repo.
- **PR / branch-diff mode (Mode A):** 3 Claude reviewers analyze `git diff $BASE...HEAD`, plus any backend reviewers (`-co` / `-gco`) in parallel
- **Full project mode (Mode B):** 6 Claude reviewers scan the entire codebase independently, plus any backend reviewers in parallel
- **Primary focus:** Bugs, problems, and actionable improvements
- **Secondary focus:** Security issues (point out if found, but not the main focus)
- Focus on practical, actionable improvements
- Don't implement speculative changes without asking
- Skip fixes requiring backend/infrastructure changes
- Prioritize: bugs -> refactoring -> structure -> performance -> security
