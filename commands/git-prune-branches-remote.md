---
name: git-prune-branches-remote
description: Clean up remote git branches that have been merged into origin/main.
---

# Git Prune Branches (Remote)

Check and prune remote branches that have been merged:

1. Fetch the latest remote information using `git fetch --prune`
2. Get the list of all remote branches using `git branch -r`
3. For each remote branch, check if it has been merged into the remote main branch using `git branch -r --merged origin/main` (or appropriate main branch)
4. Exclude protected branches (main, master, develop, etc.)
5. Create a list of remote branches that are safe to delete
6. Present the deletion list to the user clearly
7. Ask for confirmation: "The following remote branches will be deleted. Proceed? (yes/no)"
8. If user confirms with "yes" or similar affirmative response, delete the remote branches using `git push origin --delete <branch-name>` for each branch
9. Report the results

**Important:** Never delete:

- Protected branches: main, master, develop, development, staging, production
- Branches that are not fully merged (unless explicitly requested)

**Note:** This operation affects the remote repository and cannot be easily undone. Ensure user confirmation before proceeding.
