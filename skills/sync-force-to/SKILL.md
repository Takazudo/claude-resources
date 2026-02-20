---
name: sync-force-to
description: >-
  Force-sync current branch into a remote target branch by deleting the remote target and
  re-pushing. Overwrites target branch history without using git push --force. Use when 'sync-to'
  failed due to conflicts, or when user says 'sync force to', 'force sync to', 'force push to
  branch', or wants to overwrite a target branch with their current branch.
disable-model-invocation: true
argument-hint: <target-branch>
allowed-tools: Bash(bash *)
---

# sync-force-to

Overwrite a remote target branch with the current branch by deleting the remote target and re-pushing. Avoids `git push --force` by using delete + push instead.

## Usage

Run the bundled script:

```bash
bash ~/.claude/skills/sync-force-to/scripts/sync-force-to.sh $ARGUMENTS
```

Report the script output to the user verbatim. Do not add extra commentary unless there was an error.
