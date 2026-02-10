---
name: pr-make-suggestion-edit
description: Review current PR and make improvement edits without committing.
---

# PR Make Suggestion Edit

Review the current PR comprehensively and make suggestion edits to improve code quality, without committing or pushing changes.

## Review Process

### Step 1: Understand Current PR Context

First, gather context about the current PR:

1. Check current branch: `git branch --show-current`
2. View PR details: `gh pr view`
3. See what changes are in this PR: `git diff main...HEAD` (or appropriate base branch)
4. Review recent commits: `git log --oneline -10`

### Step 2: Run Comprehensive Reviews in Parallel

Run these two reviews simultaneously:

1. **Code-Reviewer Subagent Review** (Primary Focus)
   - Use Task tool with `subagent_type: "code-reviewer"`
   - Focus on structure, patterns, performance, accessibility, type safety, readability

2. **Codex MCP Review** (Secondary - Security Check)
   - Use `mcp__codex__spawn_agent` for security-focused review
   - Focus on critical security issues only

### Step 3: Analyze and Categorize Findings

Categorize findings by type and priority:

- **Structural improvements**
- **Code quality**
- **Performance**
- **Accessibility**
- **Type safety**
- **Security**
- **Bug fixes**
- **Style/Formatting**

### Step 4: Present Findings to User

Present a clear, organized summary and ask for approval before making edits.

### Step 5: Apply Suggestion Edits

After user approval:

1. **Make edits systematically** - Go through each suggested change
2. **Group changes by topic** - Keep related changes together
3. **Leave changes UNSTAGED** - Do NOT add, commit, or push anything
4. **Track what was done** - Keep a mental note of which topics were addressed

After making edits, show git status and diff.

## Important Rules

**CRITICAL - DO NOT:**

- Do NOT run `git add`
- Do NOT run `git commit`
- Do NOT run `git push`
- Do NOT stage any files

**DO:**

- Make edits using Edit tool
- Group edits by logical topics
- Leave all changes unstaged
- Clearly communicate what was changed and why
- Show git diff summary at the end

## Notes

- This command focuses on making **suggestion edits** that improve the existing PR
- Changes should be **constructive and actionable**
- Group changes by **logical topics** for easier PR creation later
- All changes remain **unstaged** for the next command to handle
- The companion command `/pr-make-suggestion-to-pr` will create PRs from these edits
