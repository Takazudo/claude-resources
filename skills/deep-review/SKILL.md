---
name: deep-review
description: "Deep code quality review focused on structure, refactoring, and best practices. Use when: (1) User says 'review', 'deep review', or 'code review', (2) After implementation when a quality check is needed, (3) Before marking a PR as ready. Default backend is /gcoc-review (zero Premium). Opt into Claude reviewers with -haiku|-so|-op (auto-detects PR vs full-project mode). Supports -co|-gco|-gcoc external backends. Default team-fix mode (-t) delegates fixes to /x-wt-teams --no-review --stay; pass -nt/--no-team for inline fixes."
argument-hint: "[-haiku|-so|-op] [-co|-gco|-gcoc] [-t|-nt]"
---

# Deep Review

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

**Default (no flags):** delegate to `/gcoc-review` — see Step 1.

### Model flags (pick at most one — enables Claude reviewers and sets the model)

- `-haiku` / `--haiku` — Claude Haiku
- `-so` / `--sonnet` — Claude Sonnet
- `-op` / `--opus` — Claude Opus

Passing any model flag opts in to the full Claude reviewer workflow (3 reviewers on a PR diff, 6 reviewers on a full project scan) and sets the `model:` field for every `code-reviewer` subagent spawned in Steps A-2 / B-2.

If multiple model flags are passed, the last one wins.

### Backend flags (combinable — external reviewers run in parallel)

- `-co` / `--codex` — force the OpenAI Codex side-by-side review on (bypass the rate-limit gate's silent-skip behavior)
- `-gco` / `--github-copilot` — also invoke `/gco-review` in parallel with the Claude reviewers
- `-gcoc` / `--github-copilot-cheap` — **default strategy.** Invokes `/gcoc-review`. Also combinable with Claude model flags to run alongside Claude reviewers.

When a Claude model flag is passed, codex side-by-side runs opportunistically (see Steps A-2b / A-2c / B-2b / B-2c). `-co` upgrades this from "opt-in when not rate-limited" to "force on and fail loudly if unavailable". `-gco` / `-gcoc` add additional external reviewers alongside Claude reviewers.

Multiple backend flags combine — every specified backend runs in parallel and all findings consolidate in Step 3.

### Team-fix flags (default `-t`)

- `-t` / `--team` — **DEFAULT.** After review findings are presented, delegate the fix work to a fresh `/x-wt-teams --no-review --stay` session so the manager context stays light. The team session creates a worktree, spawns a fix agent, commits, merges back into the current branch, and pushes. **Recursion-safe** because the inner `/x-wt-teams` is invoked with `--no-review`, which skips its own Step 9 and prevents an infinite review-fix loop.
- `-nt` / `--no-team` — Opt out of team-fix mode. Apply fixes inline in the manager context (legacy behavior — Steps 5/6/7 below). Use this when you are calling `/deep-review` from a context that already has its own fix delegation, when there is no PR / branch to merge into, or when the change is too small to justify the worktree machinery.

If both flags are passed, the last one wins. Team-fix only runs when findings are actually actionable — if the review reports "no issues," Steps 5–7 are skipped regardless of the flag.

## Review Process

### Step 1: Resolve Strategy

**Default strategy — delegate to `/gcoc-review`.**

If the invocation has **no flags**, or only the `-gcoc` / `--github-copilot-cheap` flag, delegate to `/gcoc-review` and return its findings. Do NOT spawn Claude reviewers, do NOT run the codex side-by-side pre-flight, and do NOT continue with Steps A-1 / B-1:

```
Skill(skill="gcoc-review")
```

`/gcoc-review` already handles PR-vs-default-branch detection internally, so the rest of this workflow can be skipped in the default case. Once it returns, jump straight to **Step 3: Synthesize Review Results** to present its findings, then proceed to Step 4 (Present Findings) and Step 5 (which branches on `-t` / `-nt`). Team-fix mode applies regardless of how the review was produced — `/gcoc-review` findings get the same `-t` delegation treatment as Claude-reviewer findings.

**Only continue below when a Claude model flag (`-haiku` / `-so` / `-op`) or a non-gcoc backend flag (`-co` / `-gco`) was passed.** Those flags opt in to the Claude reviewer workflow; `-gcoc` can still be combined with them to add `/gcoc-review` alongside the Claude reviewers in Step A-2d / B-2d.

### Step 2: Determine Review Mode

**CRITICAL: Detect whether this is a PR review or a full-project review.**

1. **Check current branch and PR status:**

   ```bash
   git branch --show-current
   gh pr view --json baseRefName,headRefName,number,title 2>/dev/null
   ```

2. **If current branch has a PR:**

- Use **PR Review Mode** (3 reviewers, diff-based)
- Use the PR's `baseRefName` as the base branch for diff
- Report: "Found PR #X targeting `base-branch`, reviewing changes against that branch"

3. **If current branch is the default branch (main/master) or has no PR:**

- Use **Full Project Review Mode** (6 reviewers, whole-project scan)
- Report: "On default branch with no PR — running full project review"

---

## Mode A: PR Review (3 Reviewers)

### Step A-1: Get the Diff

```bash
git diff <base-branch>...HEAD
```

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

- If `-co` / `--codex` was passed → **force codex on** (skip the rate-limit pre-flight; if codex is unreachable, surface the error instead of silently skipping).
- Otherwise → run the **opportunistic pre-flight check**:

  ```bash
  RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
  RATE_EXIT=$?
  ```

  If `RATE_EXIT` is non-zero, **silently skip ALL codex steps** (A-2b and A-2c). Do NOT report the rate limit to the user — just proceed with Claude Code reviewers only.

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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+300} node "$CODEX_COMPANION" review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-review-local.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-local-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` so it runs concurrently with the Claude Code subagents. The `--wait` flag ensures the companion script blocks until the review completes (so output is captured), while `run_in_background` ensures Claude Code doesn't wait for it before launching the subagents.

- If codex plugin is not installed or codex times out or produces no output, proceed with Claude Code reviewers' results only
- If codex produces findings, include them in the synthesis step alongside Claude Code reviewer results

### Step A-2c: Run Codex Adversarial Review in Parallel

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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+300} node "$CODEX_COMPANION" adversarial-review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-adversarial-review-local.md" \
  2>"$LOGDIR/${DATETIME}-codex-adversarial-review-local-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` — same as the standard codex review. Both codex reviews run concurrently with each other and with the Claude Code subagents.

- The adversarial review questions the approach, architecture, and design tradeoffs
- The standard review (Step A-2b) catches implementation bugs and defects
- Together they provide comprehensive cross-model coverage
- If codex fails or times out, proceed with other reviewers' results only

### Step A-2d: Run GitHub Copilot Reviews in Parallel (if `-gco` / `-gcoc` passed)

If `-gco` / `--github-copilot` was passed, invoke `/gco-review` in parallel with the Claude and codex reviewers:

```
Skill(skill="gco-review")
```

If `-gcoc` / `--github-copilot-cheap` was passed, invoke `/gcoc-review` instead (or in addition, if both flags were passed):

```
Skill(skill="gcoc-review")
```

Both `/gco-review` and `/gcoc-review` already silently fall back to Claude-based reviewers if Copilot is rate-limited — no extra handling needed. Their findings consolidate in Step 3 along with the other reviewers.

---

## Mode B: Full Project Review (6 Reviewers)

When on the default branch (or no PR exists), perform a comprehensive review of the **entire project**.

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

**Gate logic:** same as Step A-2b — if `-co` / `--codex` was passed, force codex on; otherwise use the silent `codex-rate-limit.js check` gate and skip on non-zero exit.

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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+300} node "$CODEX_COMPANION" task \
  "Review the entire codebase for bugs, logic errors, structural issues, and quality. Be concise." \
  > "$LOGDIR/${DATETIME}-codex-review-local-full.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-local-full-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)` so it runs concurrently with the Claude Code subagents. Uses `task` (not `review`) because full-project mode needs a custom prompt — the companion's `review` command only supports branch/working-tree diffs.

- If codex plugin is not installed or codex times out or produces no output, proceed with Claude Code reviewers only
- Include codex findings in synthesis if available

### Step B-2c: Run Codex Adversarial Review in Parallel

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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+300} node "$CODEX_COMPANION" adversarial-review --wait \
  > "$LOGDIR/${DATETIME}-codex-adversarial-review-local-full.md" \
  2>"$LOGDIR/${DATETIME}-codex-adversarial-review-local-full-stderr.log"
```

**IMPORTANT:** Launch this command using `Bash(..., run_in_background: true)`. Runs concurrently with the standard codex task and Claude Code subagents.

- Challenges architecture, design decisions, and assumptions across the full codebase
- If codex fails or times out, proceed with other reviewers' results only
- Include findings in synthesis if available

### Step B-2d: Run GitHub Copilot Reviews in Parallel (if `-gco` / `-gcoc` passed)

Same pattern as A-2d:

- `-gco` → `Skill(skill="gco-review")` in parallel with the other reviewers
- `-gcoc` → `Skill(skill="gcoc-review")` in parallel with the other reviewers

Each silently falls back if Copilot is rate-limited. Findings consolidate in Step 3.

---

## Post-Review Steps (both modes)

### Step 3: Synthesize Review Results

**Default path (`/gcoc-review` only):** `/gcoc-review` already returns a consolidated report — skip this step and go straight to Step 4.

**Flag-driven path (Claude reviewers + optional backends):** after receiving review results from the code-reviewer subagents and any external backends (each returns high-priority items + log path):

1. **Merge and deduplicate findings** from all reviewers' brief returns
2. **Categorize all findings by priority**
3. **Note reviewer consensus** (findings flagged by multiple reviewers are higher priority)
4. **If more detail is needed** on a specific finding, read the reviewer's log file via the returned path
5. **Collect all log file paths** for reference

### Step 4: Present Findings to User

Present a clear summary synthesized from all reviewers. Include log file paths so the user (or a future session via `/logrefer`) can access the full analysis.

If the review reports **no actionable issues**, stop here — Steps 5–7 are skipped regardless of `-t` / `-nt`.

### Step 5: Apply Fixes — branch on team-fix mode

The fix path depends on whether `-t` (default) or `-nt` was active.

#### Step 5a: Team-fix mode (`-t`, DEFAULT)

When the team-fix flag is on (the default), do NOT apply fixes inline. Instead, hand the findings off to a fresh `/x-wt-teams --no-review --stay` session that creates a worktree, spawns a fix agent, commits, merges back into the current branch, and pushes.

**Why this exists:** the manager that just ran the review is already token-heavy from collecting findings. Doing the fixes inline grows that context further. Delegating to `/x-wt-teams --no-review --stay` keeps the fix work in fresh subagent contexts and reuses the existing worktree / merge / push / CI machinery.

**Recursion guard:** the inner `/x-wt-teams` MUST be invoked with `--no-review` so its Step 9 is skipped. Without that flag, the inner session would call `/deep-review` again (which defaults back to `-t`), spawning another `/x-wt-teams`, ad infinitum. **Always pass `--no-review` here, never omit it.**

**Procedure:**

1. **Build the fix instructions block.** Combine the high-priority and medium-priority findings into a single instruction string, with file paths and line numbers, grouped by area or severity. Keep low-priority findings out unless the user explicitly asked for an aggressive pass.

   **Workspace package rebuild rule (must include in the brief when applicable).** If the project has a workspace/monorepo layout (check the repo's `CLAUDE.md` and/or `pnpm-workspace.yaml` / `package.json` `workspaces` field) and any finding's file path lives inside a workspace package whose consumer imports through a built artifact (e.g. an `exports` map → `./dist/...`), append an explicit rebuild checklist item to the fix instructions, listing the affected packages by name and the rebuild command the project uses. Example wording to forward:

   > After applying the source fixes, rebuild each touched workspace package (e.g. `pnpm --filter <name> build`) and commit the resulting build output in the same PR. The package is consumed through its built artifact, so a missing rebuild leaves the consumer importing stale compiled output. Skip only if the package has no build step. A failed build is a blocker.

   Without this, the inner `/x-wt-teams` fix agent may commit source-only changes and ship a stale-dist bug. When the project's `CLAUDE.md` names the workspace root and rebuild command, defer to it; otherwise, infer from the repo layout.

2. **Capture the current branch** as the merge target — `/x-wt-teams --stay` will treat this branch as its base:

   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   ```

3. **Invoke `/x-wt-teams --no-review --stay <fix-instructions>`** as the next action. Forward the same model / backend flags (`-haiku|-so|-op`, `-co|-gco|-gcoc`) that this `/deep-review` invocation received so the inner session uses consistent reviewers (its own internal child self-review still runs — only the manager-level Step 9 is suppressed by `--no-review`).

   **Single fix topic by default.** Bundle all findings into ONE topic so the inner session spawns a single fix agent in a single worktree. Multiple parallel fix topics would risk conflicting edits on overlapping files. If the findings are genuinely independent and span clearly separate file sets, you may split into multiple topics — but the default is one.

   Concrete invocation:

   ```
   Skill(skill="x-wt-teams", args="--no-review --stay <forwarded model/backend flags> Fix the review findings listed below. Single topic — apply all fixes in one worktree. <fix instructions including file paths, line numbers, what to change and why>")
   ```

4. **Wait for `/x-wt-teams` to complete.** When it returns, the fixes are already merged into `CURRENT_BRANCH`, pushed, and (if applicable) the root PR is updated. There is **NO Step 6 / Step 7 to run** in team-fix mode — `/x-wt-teams` already handled commits, push, and PR revise inside its own workflow.
5. **Do NOT run `/deep-review` again** to verify the fixes. That would re-trigger another `-t` cycle and loop forever. The team session's own child self-review (`/light-review`) is the verification pass — trust it and stop.

After `/x-wt-teams` returns, end the `/deep-review` session.

#### Step 5b: Inline fix mode (`-nt`)

When `-nt` was passed, apply fixes directly in the current manager context (legacy behavior).

For **High Priority** fixes:

- Implement automatically without asking

For **Medium Priority** fixes:

- If clearly useful and safe -> implement
- If uncertain about value/impact -> ask user

For **Low Priority** fixes:

- Ask user if they want these implemented

Then proceed to Step 6 and Step 7 below.

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

## Important Notes

- **Default strategy:** `/gcoc-review` (zero Premium consumption). The Claude reviewer workflow is opt-in via `-haiku` / `-so` / `-op`.
- **Default fix strategy:** `-t` team-fix mode. After findings are presented, the actual fix work is delegated to `/x-wt-teams --no-review --stay`. Pass `-nt` / `--no-team` to keep fixes inline. The recursion guard is the `--no-review` flag on the inner `/x-wt-teams` — never omit it.
- **CRITICAL (flag-driven path):** when a Claude model flag is passed, all reviews MUST be launched in parallel in a single message using the resolved model
- **PR mode:** 3 Claude reviewers analyze the diff against the base branch, plus any backend reviewers (`-co` / `-gco` / `-gcoc`) in parallel
- **Full project mode:** 6 Claude reviewers scan the entire codebase independently, plus any backend reviewers in parallel
- **Primary focus:** Bugs, problems, and actionable improvements
- **Secondary focus:** Security issues (point out if found, but not the main focus)
- Focus on practical, actionable improvements
- Don't implement speculative changes without asking
- Skip fixes requiring backend/infrastructure changes
- Prioritize: bugs -> refactoring -> structure -> performance -> security
