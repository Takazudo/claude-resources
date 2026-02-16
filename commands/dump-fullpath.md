---
name: dump-fullpath
description: Output the full absolute path of a file mentioned in the previous message.
---

# Dump Full Path

Output the full absolute path of a file from the previous context.

## Instructions

1. Look at the previous message or recent context
2. Identify the file path that was mentioned (relative or partial)
3. Output ONLY the full absolute path, nothing else

## Output Format

Output the absolute path on a single line with no additional text:

```
/Users/username/path/to/file.ext
```

## Example

If the previous message mentioned creating `__inbox/_0113-report.md` in `$HOME/repos/work/my-project/`:

```
$HOME/repos/work/my-project/__inbox/_0113-report.md
```
