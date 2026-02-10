---
name: local-review
description: Perform code quality review focused on structure, refactoring, and best practices.
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

### Step 1: Determine Base Branch

**CRITICAL: Always confirm the correct base branch before reviewing to avoid wasting time on wrong diffs.**

1. **Check if current branch has an existing PR:**
   ```bash
   gh pr view --json baseRefName,headRefName,number,title 2>/dev/null
   ```

2. **If PR exists:**
   - Use the PR's `baseRefName` as the base branch for diff
   - Report to user: "Found PR #X targeting `base-branch`, reviewing changes against that branch"

3. **If no PR exists:**
   - Fall back to default branch (main/master)
   - Or ask user which branch to compare against if unclear

4. **Get the diff against the correct base branch:**
   ```bash
   git diff <base-branch>...HEAD
   ```

This ensures reviewers analyze only the relevant changes for this PR/feature branch.

### Step 2: Run Parallel Reviews

**IMPORTANT: Run ALL reviews in PARALLEL using a single response with multiple tool calls**

**Use Task tool with `subagent_type: "code-reviewer"` and `model: "opus"` THREE times in parallel**

Each reviewer should focus on different aspects to get comprehensive coverage:

**Reviewer 1: Bugs & Logic**
```
Review the code changes focusing on:

PRIMARY FOCUS:
1. Silly mistakes and bugs (logic errors, typos, incorrect implementations)
2. Missing null checks, off-by-one errors
3. Incorrect API usage, broken functionality
4. Error handling issues

Provide specific, actionable feedback with code examples.
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

Provide specific, actionable feedback with code examples.
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

Provide specific, actionable feedback with code examples.
```

**CRITICAL: Launch all 3 code-reviewer subagents in PARALLEL in a single message using Opus model**

### Step 3: Synthesize Review Results

After receiving ALL 3 review results from code-reviewer subagents:

1. **Merge and deduplicate findings** from all reviewers
2. **Categorize all findings by priority**
3. **Identify useful fixes** that can be implemented
4. **Note reviewer consensus**

### Step 4: Present Findings to User

Present a clear summary synthesized from all 3 reviewers.

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

## Important Notes

- **CRITICAL:** All 3 reviews MUST be launched in parallel in a single message using Opus model
- **Primary focus:** Code quality, structure, refactoring (spend most effort here)
- **Secondary focus:** Security issues (point out if found, but not the main focus)
- Focus on practical, actionable improvements
- Don't implement speculative changes without asking
- Skip fixes requiring backend/infrastructure changes
- Prioritize: silly mistakes -> refactoring -> structure -> security
