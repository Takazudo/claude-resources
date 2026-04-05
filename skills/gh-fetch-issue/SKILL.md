---
name: gh-fetch-issue
description: "Fetch a GitHub issue with all attachments (images, screenshots) downloaded locally so Claude can read them. Use this skill PROACTIVELY whenever: (1) User provides a GitHub issue URL, (2) User asks to read/view/check a GitHub issue, (3) User references an issue number and wants to see its content, (4) User asks about issue screenshots or images. This skill ensures Claude can see issue-embedded images that are otherwise inaccessible via API."
user-invocable: true
argument-hint: <issue-url-or-number> [--repo owner/repo]
allowed-tools:
  - Bash(bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh *)
  - Read
  - Glob
---

# gh-fetch-issue

Fetch a GitHub issue with attachments downloaded locally for Claude to read.

## Why This Skill Exists

GitHub issue images (`github.com/user-attachments/assets/...`) require authentication and cannot be fetched via WebFetch. This skill downloads everything locally so Claude can read both the markdown content and all attached images.

## Usage

```bash
# By URL
bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh https://github.com/owner/repo/issues/123

# By issue number (auto-detects repo from current git remote)
bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh 123

# By issue number with explicit repo
bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh 123 --repo owner/repo
```

## Workflow

1. Run the fetch script — it prints the output directory path
2. Read `{output-dir}/issue.md` for the issue content
3. If an `assets/` subdirectory exists, read the image files to see screenshots and attachments
4. Present findings to the user

## Output Location

```
$HOME/cclogs/{repo-slug}/{date}-issue-{number}/
├── issue.md          # Issue content with local image paths
└── assets/           # Downloaded images (if any)
    ├── body-{id}.png
    └── comment-0-{id}.png
```

The `{repo-slug}` is `owner-repo` in lowercase (e.g., `zudolab-zudo-text`). The `{date}` is `YYYYMMDD`.
