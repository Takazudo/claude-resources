---
name: start-wt-dev
description: Prepare a git worktree for development on a GitHub issue.
---

# Start Worktree Development

Prepare a git worktree for development on a GitHub issue. Creates worktree, generates prompt file with issue details, and outputs paths for easy session start.

## Input Formats

Parse the user's input to determine the type:

1. **GitHub URL**: `https://github.com/owner/repo/issues/123`
   - Extract: owner, repo, issue number

2. **Issue Number**: `123`
   - Use as issue number for current repo

3. **Proposal Text**: `"Add authentication system"`
   - Create GitHub issue first, then proceed

4. **No Arguments**:
   - Ask user what they want to implement

## Workflow

### Step 1: Parse and Validate Input

**If GitHub URL:**
```bash
gh issue view <issue-num> --repo <owner/repo>
```

**If Issue Number:**
```bash
gh issue view <issue-num>
```

**If Proposal Text or No Args:**

- Understand the proposal
- Ask clarifying questions if needed
- Create GitHub issue
- Get issue number from created issue
- Ask user for confirmation before proceeding

### Step 2: Create Worktree

Use the helper script:

```bash
bash ~/.claude/__inbox/start-wt-dev-skill-backup/scripts/create-worktree.sh <issue-number> [repo]
```

**Arguments:**

- `issue-number`: The GitHub issue number (required)
- `repo`: Repository in format `owner/repo` (optional, only if different from current repo)

### Step 3: Output Results

The script will output:
```
Worktree created successfully

cd /path/to/worktrees/issue-123-feature-name
prompt: /path/to/worktrees/issue-123-feature-name/__inbox/issue-123-prompt-feature-name.md
```

Tell the user:

1. Copy the `cd` command and paste in a new terminal
2. Start a new Claude Code session there
3. Reference the prompt file to begin implementation

## Error Handling

- **Invalid URL**: Show error and ask for correct format
- **Issue doesn't exist**: Verify with `gh issue view` and report error
- **Worktree already exists**: Show error and suggest `git worktree list`
- **Not in git repo**: Show error and ask user to navigate to a git repository
- **Missing dependencies**: Script will check for `gh`, `jq`, and `git`

## Examples

### Example 1: With GitHub URL

```
User: /start-wt-dev https://github.com/Takazudo/zmodular/issues/268
-> Parse URL: repo=Takazudo/zmodular, issue=268
-> Verify issue exists
-> Run script with: 268 Takazudo/zmodular
-> Output paths
```

### Example 2: With Issue Number

```
User: /start-wt-dev 123
-> Verify issue exists in current repo
-> Run script with: 123
-> Output paths
```

### Example 3: With Proposal

```
User: /start-wt-dev "Add dark mode toggle to settings"
-> Analyze proposal
-> Create GitHub issue
-> Ask for confirmation
-> User confirms
-> Run script with created issue number
-> Output paths
```
