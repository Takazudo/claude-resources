---
name: local-review
description: >-
  Perform code quality review focused on structure, refactoring, and best practices. Use when: (1)
  User says 'review', 'local review', or 'code review', (2) After implementation is complete and
  quality check is needed, (3) Before marking a PR as ready for review. Auto-detects PR mode (3
  reviewers on diff) vs full project mode (6 reviewers on entire codebase).
---

# Local Review

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

## Review Process

### Step 1: Determine Review Mode

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

**Use Task tool with `subagent_type: "code-reviewer"` and `model: "opus"` THREE times in parallel**

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

**CRITICAL: Launch all 3 code-reviewer subagents in PARALLEL in a single message using Opus model**

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

**Use Task tool with `subagent_type: "code-reviewer"` and `model: "opus"` SIX times in parallel**

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

**CRITICAL: Launch all 6 code-reviewer subagents in PARALLEL in a single message using Opus model**

---

## Post-Review Steps (both modes)

### Step 3: Synthesize Review Results

After receiving review results from code-reviewer subagents (each returns high-priority items + log path):

1. **Merge and deduplicate findings** from all reviewers' brief returns
2. **Categorize all findings by priority**
3. **Note reviewer consensus** (findings flagged by multiple reviewers are higher priority)
4. **If more detail is needed** on a specific finding, read the reviewer's log file via the returned path
5. **Collect all log file paths** for reference

### Step 4: Present Findings to User

Present a clear summary synthesized from all reviewers. Include log file paths so the user (or a future session via `/logrefer`) can access the full analysis.

### Step 5: Apply Fixes

For **High Priority** fixes:

- Implement automatically without asking

For **Medium Priority** fixes:

- If clearly useful and safe -> implement
- If uncertain about value/impact -> ask user

For **Low Priority** fixes:

- Ask user if they want these implemented

### Step 6: Commit Changes

After applying fixes:

1. Run type check: `npm run typeCheck`
2. Create a descriptive commit message listing all fixes
3. Use the standard commit format with footer

### Step 7: Revise PR (PR mode only)

If this was a PR review (Mode A) and fixes were committed:

1. Invoke `/pr-revise` to update the PR title and description
2. This ensures the PR metadata reflects the full implementation including the review fixes
3. Skip this step if no fixes were applied or if running in full project mode (Mode B)

## Important Notes

- **CRITICAL:** All reviews MUST be launched in parallel in a single message using Opus model
- **PR mode:** 3 reviewers analyze the diff against the base branch
- **Full project mode:** 6 reviewers scan the entire codebase independently
- **Primary focus:** Bugs, problems, and actionable improvements
- **Secondary focus:** Security issues (point out if found, but not the main focus)
- Focus on practical, actionable improvements
- Don't implement speculative changes without asking
- Skip fixes requiring backend/infrastructure changes
- Prioritize: bugs -> refactoring -> structure -> performance -> security
