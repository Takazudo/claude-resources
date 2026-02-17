---
name: commits-auto
description: >-
  Enable automatic committing mode. From now on, commit changes automatically without asking for
  permission during development. Use when: (1) User says 'commits auto', 'auto commit', 'commit
  automatically', (2) User wants hands-off development where commits happen as work progresses.
---

# Commits Auto

From now on, commit changes automatically without asking for permission. After completing each meaningful unit of work (feature, fix, refactor), create commits immediately.

## Commit Strategy

Follow the same strategy as `/commits`:

1. Check `git status` and `git diff --stat`
2. Check for unwanted files and update `.gitignore` if needed
3. Stage only intentional, meaningful changes (never `git add .` blindly)
4. Group changes logically — single commit if related, separate commits if unrelated
5. Use conventional commit style (feat:, fix:, docs:, refactor:, etc.)
6. Add `Co-Authored-By: Claude <noreply@anthropic.com>` when appropriate
7. Use HEREDOC format for commit messages
8. Never use `git commit --amend` without explicit permission

## Key Rules

- **Do NOT ask** before committing — just commit after completing work
- **Do ask** if unsure whether a specific file should be included
- Prefer smaller, focused commits over large monolithic ones
- Proactively update `.gitignore` when unwanted files are found
