---
name: git-prune-branches-local
description: Clean up local git branches that have been merged into main/master.
---

# Git Prune Branches (Local)

Check and prune local branches that have been merged:

1. Get the list of all local branches using `git branch`
2. For each branch, check if it has been merged into the main branch using `git branch --merged`
3. Exclude protected branches (main, master, develop, etc.)
4. Create a list of branches that are safe to delete
5. Present the deletion list to the user clearly
6. Ask for confirmation: "The following local branches will be deleted. Proceed? (yes/no)"
7. If user confirms with "yes" or similar affirmative response, delete the branches using `git branch -d <branch-name>` for each branch
8. Report the results

**Important:** Never delete:

- The currently checked out branch
- Protected branches: main, master, develop, development, staging, production
- Branches that are not fully merged (unless explicitly requested)
