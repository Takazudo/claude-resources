---
name: git-prune-branches-both
description: Clean up both local and remote git branches that have been merged.
---

# Git Prune Branches (Both Local and Remote)

Check and prune both local and remote branches that have been merged:

## Step 1: Prune Local Branches

1. Get the list of all local branches using `git branch`
2. For each branch, check if it has been merged using `git branch --merged`
3. Exclude protected branches (main, master, develop, etc.)
4. Create a list of local branches that are safe to delete

## Step 2: Prune Remote Branches

1. Fetch the latest remote information using `git fetch --prune`
2. Get the list of all remote branches using `git branch -r`
3. For each remote branch, check if it has been merged into the remote main branch
4. Exclude protected branches
5. Create a list of remote branches that are safe to delete

## Step 3: Confirm and Execute

1. Present both lists to the user clearly:
  - Local branches to be deleted
  - Remote branches to be deleted
2. Ask for confirmation: "The above local and remote branches will be deleted. Proceed? (yes/no)"
3. If user confirms with "yes" or similar affirmative response:
  - Delete local branches using `git branch -d <branch-name>`
  - Delete remote branches using `git push origin --delete <branch-name>`
4. Report the results for both operations

**Important:** Never delete:

- The currently checked out branch (for local)
- Protected branches: main, master, develop, development, staging, production
- Branches that are not fully merged (unless explicitly requested)

**Note:** Remote deletion affects the repository for all users and cannot be easily undone. Ensure user confirmation before proceeding.
