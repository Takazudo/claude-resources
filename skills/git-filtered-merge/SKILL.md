---
name: git-filtered-merge
description: >-
  Filtered squash merge: take only matching paths (e.g., doc/) from a source branch
  and apply them to a target branch via squash merge, PR creation.
  Use when: (1) User says 'filtered merge', 'sync doc to develop', 'cherry-pick directory',
  (2) User wants to sync a subset of changes between branches,
  (3) User needs to apply only specific directory or file changes from one branch to another.
user-invocable: true
argument-hint: "[branch-name]"
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# Git Filtered Merge

Squash merge a source branch into a new branch off the target, keep only paths matching a filter, then commit, push, and create a PR.

## Parameters

Collect via AskUserQuestion (single prompt with all questions):

1. **Base branch** (required): branch to update (e.g., `develop`)
2. **Source branch** (required): branch to take changes from (e.g., `base/fanbassador-post`)
3. **Filter paths** (required): space-separated paths to keep (e.g., `doc/`)
4. **Branch name** (optional): if not given, auto-generate from filter + base (e.g., `sync-doc-to-develop`)

If the skill was invoked with an argument, use it as the branch name and skip asking for it.

## Workflow

```
1. git fetch origin
2. Show filtered diff: git diff origin/<base>...<source> -- <filter-paths> --stat
   - If no changes, abort with message
   - Show to user for confirmation before proceeding
3. git checkout -b <branch-name> origin/<base>
4. git merge --squash <source>
5. git reset HEAD
6. git add <filter-paths>
7. git checkout -- . && git clean -fd
8. git diff --cached --stat  (verify only filtered changes staged)
9. Commit with message: "docs: <source> ブランチの変更を <base> に同期"
   - Adjust prefix (docs/feat/fix) based on content
10. git push -u origin <branch-name>
11. gh pr create --base <base> with project CLAUDE.md conventions
12. Return PR URL
```

## Important

- If the project has CLAUDE.md PR conventions (Japanese titles, headers), follow them
- If no changes match the filter, abort early and inform the user
- Never force push
