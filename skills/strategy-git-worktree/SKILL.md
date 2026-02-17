---
name: strategy-git-worktree
description: >-
  Parallel multi-topic development using git worktrees with a base branch strategy. Use when: (1)
  User wants to work on multiple related features in parallel, (2) User mentions 'worktree', 'base
  branch', or 'parallel development', (3) User wants a manager session to coordinate child sessions,
  (4) User says 'split into topics' or 'multi-topic development'. Covers: base branch creation,
  worktree initialization, topic branch management, PR strategy (topic PRs into base, root PR into
  main), and manager/child session coordination.
---

# Git Worktree Multi-Topic Development

Coordinate parallel development of multiple related features using git worktrees, a shared base branch, and manager/child Claude Code sessions.

## Architecture

```
<parent-branch> (the branch you branch from — could be main, develop, or a feature branch)
  └── base/<project-name>  (base branch, created by manager)
        ├── <project-name>/topicA  (child branch → PR into base)
        ├── <project-name>/topicB  (child branch → PR into base)
        └── <project-name>/topicC  (child branch → PR into base)

worktrees/
  ├── <topicA>/  (worktree for topicA branch)
  ├── <topicB>/  (worktree for topicB branch)
  └── <topicC>/  (worktree for topicC branch)
```

Each topic gets its own worktree directory, its own branch, and its own PR targeting the base branch. The manager merges topic PRs into the base branch, then creates one root PR from base into main.

## Roles

### Manager Session (root repo)

The manager session operates from the repo root directory. It:

1. Creates the base branch from the parent branch
2. Creates the root PR immediately (draft, with empty commit) — this locks in the correct parent branch
3. Creates worktrees for each topic
4. Reviews and merges topic PRs into the base branch
5. Updates the root PR and marks it ready for review

### Child Sessions (worktree dirs)

Each child session operates from its own worktree directory. It:

1. Implements its assigned topic
2. Commits and pushes to its topic branch
3. Creates a PR targeting the base branch
4. Addresses review feedback from the manager

## Manager Workflow

### Step 1: Create Base Branch and Root PR

The base branch is created from whichever branch is the "parent" — this is often `main` or `develop`, but can also be a feature branch.

**CRITICAL**: Create the root PR immediately with an empty commit. This locks in the correct parent branch from the start, so you never forget or misidentify it later. This follows the same principle as `/strategy-impl-as-pr`.

```bash
# Ensure parent branch is up to date
git checkout <parent-branch>
git pull origin <parent-branch>

# Create the base branch
git checkout -b base/<project-name>

# Create empty start commit and push
git commit --allow-empty -m "= start <project-name> dev ="
git push -u origin base/<project-name>

# Create the root PR immediately (draft, targeting parent branch)
gh pr create \
  --base <parent-branch> \
  --title "<project-name>: root PR title" \
  --body "$(cat <<'EOF'
## Summary
(in progress)

## Topic PRs
(to be added as topics are completed)
EOF
)" \
  --draft
```

Save the root PR number — you will update it as topics are merged.

### Step 2: Create Worktrees

For each topic:

```bash
# Create worktree with a topic branch based on the base branch
git worktree add worktrees/<topic-name> -b <project-name>/<topic-name> base/<project-name>
```

Example with 3 topics:
```bash
git worktree add worktrees/topicA -b marker-fix/topicA base/marker-fix
git worktree add worktrees/topicB -b marker-fix/topicB base/marker-fix
git worktree add worktrees/topicC -b marker-fix/topicC base/marker-fix
```

### Step 3: Environment Setup (if needed)

If the project has environment files, symlink them into each worktree:

```bash
for wt in worktrees/*/; do
  ln -sf "$(pwd)/.env" "$wt/.env" 2>/dev/null
  # Add project-specific symlinks as needed (e.g., metadata, generated files)
done
```

If using pnpm workspaces, install dependencies in each worktree:

```bash
for wt in worktrees/*/; do
  (cd "$wt" && pnpm install)
done
```

### Step 4: Launch Child Sessions

Tell the user to start a new Claude Code session in each worktree directory:

```
cd worktrees/<topic-name>
claude
```

Or use Claude Code teams with the Task tool to spawn child agents in each worktree.

### Step 5: Review and Merge Topic PRs

As child sessions complete work and create PRs, **merge each topic PR via GitHub** (not command-line merge). This keeps the PR marked as "Merged" and avoids stale open PRs.

```bash
# Review each topic PR
gh pr view <pr-number>
gh pr diff <pr-number>

# Merge topic PRs into base branch (regular merge, not squash)
gh pr merge <pr-number>
```

**IMPORTANT**: Do not skip merging PRs. If topic work is merged directly into the base branch without going through the PR, close the PR explicitly: `gh pr close <pr-number> --comment "Merged outside PR"`. Leaving PRs open with deleted branches causes confusion.

### Step 6: Update Root PR and Mark Ready

The root PR was already created in Step 1. After all topics are merged, update it with the final summary and mark it ready for review.

```bash
# Update the root PR body with merged topic details
gh pr edit <root-pr-number> --body "$(cat <<'EOF'
## Summary
- Merged topicA: description
- Merged topicB: description
- Merged topicC: description

## Topic PRs
- #N topicA
- #N topicB
- #N topicC
EOF
)"

# Mark ready for review (remove draft status)
gh pr ready <root-pr-number>
```

### Step 7: Cleanup

After the root PR is merged:

```bash
# Remove worktrees
for wt in worktrees/*/; do
  git worktree remove "$wt"
done

# Delete local and remote topic branches
git branch -d <project-name>/topicA <project-name>/topicB <project-name>/topicC
git push origin --delete <project-name>/topicA <project-name>/topicB <project-name>/topicC

# Delete base branch
git branch -d base/<project-name>
git push origin --delete base/<project-name>
```

## Child Session Workflow

### Step 1: Verify Branch

```bash
git branch --show-current
# Should show: <project-name>/<topic-name>
```

### Step 2: Implement

Work normally — edit files, run tests, commit.

### Step 3: Push and Create PR

```bash
git push -u origin <project-name>/<topic-name>

# Create PR targeting the base branch
gh pr create --base base/<project-name> \
  --title "Topic: description" \
  --body "Description of changes"
```

## Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base branch | `base/<project>` | `base/marker-fix` |
| Topic branch | `<project>/<topic>` | `marker-fix/bogaudio-knobs` |
| Worktree dir | `worktrees/<topic>` | `worktrees/bogaudio-knobs` |

## Important Rules

1. **Always pull the parent branch before creating the base branch** — stale bases cause conflicts
2. **Create the root PR immediately in Step 1** — an empty commit + draft PR locks in the correct parent branch. This prevents the common mistake of forgetting or misidentifying the parent branch later when creating the root PR at the end
3. **Never force push** — regular merge only, preserves history
4. **Topic PRs target the base branch**, not the parent branch
5. **Root PR targets the parent branch** — this is handled automatically by creating it in Step 1
6. **worktrees/ must be in .gitignore** — worktrees are local only
7. **Manager session stays at repo root** — never cd into worktrees for git ops
8. **Each child session stays in its worktree** — git ops affect that branch only
9. **Always merge PRs before cleanup** — never leave topic PRs or the root PR open. Open PRs with stale branches cause confusion later. The full flow is: merge topic PRs → update root PR → merge root PR → then cleanup branches. If you merge directly (e.g., fast-forward on the command line) instead of via the PR, close the PR explicitly with a comment explaining it was merged outside the PR

## Prerequisites

- `worktrees/` in `.gitignore`
- `gh` CLI authenticated
- `git` version 2.15+ (worktree support)

## Quick Reference

```bash
# Manager: full setup (replace <parent-branch> with the branch you're branching from)
git checkout <parent-branch> && git pull origin <parent-branch>
git checkout -b base/my-project
git commit --allow-empty -m "= start my-project dev ="
git push -u origin base/my-project

# Create root PR immediately (locks in correct parent branch!)
gh pr create --base <parent-branch> --title "My Project: root PR" --draft --body "## Summary\n(in progress)"

# Create worktrees
git worktree add worktrees/topic1 -b my-project/topic1 base/my-project
git worktree add worktrees/topic2 -b my-project/topic2 base/my-project

# Child: push and PR
git push -u origin my-project/topic1
gh pr create --base base/my-project --title "Topic1: description"

# Manager: merge topics, update root PR, mark ready
gh pr merge <topic1-pr> && gh pr merge <topic2-pr>
gh pr edit <root-pr> --body "## Summary\n- topic1\n- topic2"
gh pr ready <root-pr>

# Manager: cleanup after root PR merged
git worktree remove worktrees/topic1 && git worktree remove worktrees/topic2
```
