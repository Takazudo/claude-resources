---
name: gh-fetch-issue
description: "Fetch a GitHub issue with all attachments (images, screenshots) downloaded locally so Claude can read them. Also resolves `/ss <filename>` screenshot placeholders in the issue by uploading the matching local screenshots and embedding them as real images. Use PROACTIVELY when: (1) User provides a GitHub issue URL, (2) User asks to read/view/check a GitHub issue, (3) User references an issue number, (4) User asks about issue screenshots or images. Ensures Claude can see issue-embedded images that are otherwise inaccessible via API."
user-invocable: true
argument-hint: <issue-url-or-number> [--repo owner/repo]
allowed-tools:
  - Bash(bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh *)
  - Bash(python3 $HOME/.claude/skills/gh-fetch-issue/scripts/resolve-ss.py *)
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

1. Always resolve `/ss` placeholders first (see below) — run it on every fetch without checking whether placeholders exist; it self-checks and no-ops when there are none. This uploads any pending screenshots and rewrites the issue on GitHub, so the next step downloads real images instead of placeholders
2. Run the fetch script — it prints the output directory path
3. Read `{output-dir}/issue.md` for the issue content
4. If an `assets/` subdirectory exists, read the image files to see screenshots and attachments
5. Present findings to the user

## Resolving `/ss` Screenshot Placeholders

When drafting an issue, the user drops placeholder lines instead of manually
attaching screenshots:

```
/ss Screenshot 2026-07-02 at 4.15.54.png
```

Each names a file in the Dropbox screenshots dir (`$DROPBOX_SCREENSHOTS_DIR`).
The resolve step finds those lines, uploads the matching local images to the
repo's `_attachments` release (via the gh-issue-with-imgs upload helper), and
rewrites the issue body/comments so each placeholder becomes a real embedded
image (`![filename](asset-url)`) that renders on GitHub.

Run it before fetching:

```bash
python3 $HOME/.claude/skills/gh-fetch-issue/scripts/resolve-ss.py <issue-url-or-number> [--repo owner/repo]
```

- Safe to always run: with no `/ss` lines it prints "nothing to resolve" and exits
- Idempotent: a rewritten line no longer matches, so nothing uploads twice
- Placeholders whose file is missing from the screenshots dir are left untouched and reported
- Add `--dry-run` to preview what would change without uploading or editing the issue
- For private repos the embedded image is viewable by authenticated collaborators (the intended audience), not anonymously

## Output Location

```
$HOME/cclogs/{repo-slug}/{date}-issue-{number}/
├── issue.md          # Issue content with local image paths
└── assets/           # Downloaded images (if any)
    ├── body-{id}.png
    └── comment-0-{id}.png
```

The `{repo-slug}` is `owner-repo` in lowercase (e.g., `zudolab-zudo-text`). The `{date}` is `YYYYMMDD`.
