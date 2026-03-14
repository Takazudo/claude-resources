---
name: logrefer
description: >-
  Browse and read recent logs and artifacts from ~/cclogs/{slug}/. Use when: (1) User wants to see
  recent agent logs, (2) User says 'logrefer', 'show logs', 'recent logs', (3) User wants to read
  a specific log file from a previous session.
user_invocable: true
argument_description: "[N] [prefix] [read <filename>]"
---

# Log Browser

Browse and read recent logs and artifacts from the centralized log directory (`~/cclogs/{slug}/`).

## Determine Log Directory

Get the log directory for the current project:

```bash
LOGDIR=$(node ~/.claude/scripts/get-logdir.js)
```

If the directory does not exist, inform the user that no logs have been saved yet for this project.

## Argument Handling

Check `$ARGUMENTS` for these patterns:

- **No arguments**: List 10 most recent files with filename and first heading
- **A number (e.g., `20`)**: List that many most recent files
- **A prefix string (e.g., `reviewer`, `research`, `frontend-dev`, `wt-child`, `youtube`)**: Filter files by that prefix pattern
- **`read <filename>`**: Read and display the full content of the specified file

## Workflow

### Listing Files

1. Run `ls -t "$LOGDIR"` to get files sorted by modification time (newest first)
2. Limit to N files (default 10)
3. If a prefix filter is given, filter with `ls -t "$LOGDIR" | grep "<prefix>"`
4. For each file, extract the first markdown heading (`grep -m1 '^#' "$LOGDIR/<file>"`)
5. Display as a formatted list: `filename -- heading`

### Reading a File

1. Match the filename argument against files in `$LOGDIR`
2. Use the Read tool to display the full file content
3. If the filename is ambiguous (partial match), show matching files and ask the user to clarify

## Output Format

### List Mode

```
Recent logs in ~/cclogs/{slug}/:

  0314_1530-reviewer-auth-refactor.md -- Auth Module Code Review
  0314_1200-research-caching-strategies.md -- Caching Strategy Analysis
  0313_0900-frontend-dev-dashboard.md -- Dashboard Component Implementation
  ...
```

### Read Mode

Display the full file content using the Read tool.

## Notes

- If `$LOGDIR` doesn't exist or is empty, inform the user that no logs have been saved yet for this project
- The log directory is project-specific: detected from the git repository root basename
- Worktrees share the same log directory as their main repository
