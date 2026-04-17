---
name: commits
description: "Commit necessary changes with appropriate separation. Use when: (1) User says 'commit', 'commits', or 'save changes', (2) Claude has made changes that need committing, (3) User wants to commit with proper grouping and conventional commit messages. Handles .gitignore updates, file selection, logical grouping, and clean commit messages."
argument-hint: "[push] [--no-push] [--push-auto]"
---

# Commits Command

Make commits for all necessary changes in the working directory.

## Argument Handling

Check `$ARGUMENTS` for these flags (case-insensitive, hyphens optional):

- **"push"**: Also push to the remote after committing.
- **"--nopush" or "--no-push"**: Before committing, invoke `/push-forbid` to disable automatic pushing for the rest of the session.
- **"--pushok" or "--push-ok" or "--pushauto" or "--push-auto"**: Before committing, invoke `/push-auto` to enable automatic pushing for the rest of the session.

## Execution Strategy (Token Cost Optimization)

Offload the commit workflow to a Haiku subagent so the expensive main Opus context only sees a summary — not the full git diff, file-selection reasoning, or commit-message drafting.

### Step 0: Pre-check (skip subagent when nothing to do)

Before anything else, run these two checks via Bash:

```bash
git status --porcelain
git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "unknown"
```

Based on the results:

- **Nothing to commit + nothing to push** → Report "Nothing to commit or push." and **stop immediately**. Done.
- **Nothing to commit + commits ahead + `push` argument present** → No subagent needed. Run `git pull --rebase && git push` directly. Report and **stop**. Done.
- **Nothing to commit + "unknown" (no upstream) + `push` argument present** → New branch with no remote tracking. Run `git push -u origin $(git branch --show-current)`. Report and **stop**. Done.
- **Nothing to commit + commits ahead + NO `push` argument** → Report "Nothing to commit. N commit(s) ahead of remote — use `/commits push` to push." and **stop**. Done.
- **Something to commit** → Continue to Attempt 1 below.

### Attempt 1: Haiku subagent

Spawn a **Haiku subagent** using the Agent tool with `model: "haiku"`. Give it the full Instructions section below as its prompt, plus the current repo path and whether `push` is requested. The subagent runs in its own isolated context — the main Opus context only sees the final report, not the intermediate git diff/status output.

If the subagent reports success: **stop here**. Done.

If the subagent fails (partial commits, rebase conflict, or any error): run `git status` and `git log --oneline` to assess current state, then continue with Attempt 2 for the remainder.

### Attempt 2: Direct execution (last resort)

Only if Attempt 1 failed, execute the Instructions below directly in the current session. Handles commit and (if `push` argument present) push.

---

## Conflict Handling (rebase conflict during push)

If `git pull --rebase` fails due to a conflict:

**If running as a child agent in a team:**

1. Do NOT attempt conflict resolution — you lack the full picture
2. Abort with `git rebase --abort`
3. Report to the manager immediately with: branch name, that a rebase conflict occurred, and any conflict details from the output
4. The manager will judge complexity and either resolve it directly or spawn an Opus subagent with full implementation context

**If running standalone (no team):**

1. Run `git rebase --abort` to restore the pre-rebase state
2. Run `git fetch && git log --oneline HEAD..origin/$(git branch --show-current)` to see incoming commits
3. Run `git pull --rebase` again to see the actual conflicts
4. Assess complexity:
- **Simple** (whitespace, non-overlapping, trivial): resolve directly, `git rebase --continue`, then `git push`
- **Complex** (overlapping logic, multiple files, unclear intent): abort with `git rebase --abort`, then resolve carefully with full awareness of what was implemented before retrying push

---

## Instructions

1. **Check current status**

- Run `git status` to see all modified, staged, and untracked files
- Run `git diff --stat` to understand the scope of changes

2. **Check for unwanted files and update .gitignore**

   Before proceeding, scan the output for files that should never be committed:

   **Files/directories to exclude:**

- `node_modules/` - Package dependencies
- Build outputs: `dist/`, `build/`, `.next/`, `out/`, `*.bundle.js`
- Log files: `*.log`, `npm-debug.log*`, `yarn-error.log`
- Temporary files: `*.tmp`, `*.temp`, `.cache/`, `*.swp`, `*~`
- OS files: `.DS_Store`, `Thumbs.db`, `Desktop.ini`
- IDE files: `.idea/`, `.vscode/`, `*.sublime-*` (unless intentional)
- Environment files: `.env`, `.env.local`, `.env*.local`
- Test coverage: `coverage/`, `.nyc_output/`
- Package manager: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` (context-dependent)
- Secrets/credentials: `*.pem`, `*.key`, `credentials.json`, `secrets.*`

  **If unwanted files are found:**

1. Check if `.gitignore` exists in the project root
2. If it exists, check if the unwanted patterns are already listed
3. If patterns are missing, add them to `.gitignore`
4. If `.gitignore` doesn't exist and project has `package.json` or other project markers, create one with common patterns
5. After updating `.gitignore`, the ignored files will no longer appear in `git status`

   **If any unwanted files are already staged:**

- Unstage them with `git reset HEAD <file>`
- If they were previously committed, inform the user they may need to remove them from history

  **Temporary image/screenshot files (NEVER add to .gitignore):**

  Image files (`*.png`, `*.jpg`, `*.gif`, `*.webp`, screenshot SVGs) in the repo root or non-content directories are typically temporary — generated by headless browsers or shared during conversation. Do NOT add glob patterns like `*.png` to `.gitignore`. Instead:

- If the files appear **no longer needed** (old screenshots, leftover from previous work): **delete them** with `rm`
- If the files appear **still useful** (referenced in the current conversation): **move them** to the log directory: `LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js) && mkdir -p "$LOGDIR" && mv <file> "$LOGDIR/"`
- Never add image glob patterns to `.gitignore` — it confuses users about what the pattern is for and may accidentally exclude intentional image assets

3. **Filter and select files to commit**

- Review remaining files after .gitignore filtering
- Only stage files that contain intentional, meaningful changes
- Skip auto-generated files (timestamps, caches, lock files unless relevant)
- If unsure about a file, ask the user

4. **Analyze and group changes**

- If changes are small and related: make a single commit
- If changes span multiple unrelated concerns: separate into logical commits
- Examples of good separation:
  - Documentation changes vs code changes
  - Feature additions vs bug fixes
  - Refactoring vs new functionality
  - Config changes vs source changes

5. **Create commits**

- **Optional: get a Copilot-drafted message first (fail-silent)**

  Before writing the commit message yourself, try:

  ```bash
  $HOME/.claude/skills/gco/scripts/gcom-msg.sh
  ```

  This works in both Attempt 1 (Haiku subagent) and Attempt 2 (direct execution).
  - On success: review the draft, adjust as needed, then use it with `git commit -m`.
  - On failure (non-zero exit, rate-limited, empty output): ignore and fall back to the Claude-drafted message below.

- Write clear, concise commit messages
- Use conventional commit style when appropriate (feat:, fix:, docs:, refactor:, etc.)
- Add `Co-Authored-By: Claude <noreply@anthropic.com>` if Claude contributed significantly
- Use HEREDOC format for commit messages:

  ```bash
  git commit -m "$(cat <<'EOF'
  Commit message here

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

6. **Push (only if `push` argument is present)**

- Check commits ahead: `git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "unknown"`
- If 0 commits ahead: nothing to push, skip to Verify
- If `"unknown"` (no upstream / new branch): run `git push -u origin $(git branch --show-current)`, skip to Verify
- Otherwise: run `git pull --rebase` then `git push`
- If `git pull --rebase` fails with a conflict, follow the Conflict Handling section above

7. **Verify**

- Run `git status` after committing to confirm working tree is clean
- Run `git log --oneline -n <number of commits>` to show what was committed

## Important Notes

- Never use `git add .` blindly - be selective about what to stage
- If unsure whether a file should be committed, ask the user
- Prefer smaller, focused commits over large monolithic commits
- Always verify the commit was successful before moving on
- **Never use `git commit --amend` without explicit user permission** - Always create new commits by default. Amending commits can be confusing and may cause issues if the original commit was already shared. If you need to fix a previous commit, ask the user first.
- **Proactively update .gitignore** - If you see files that should be ignored (node_modules, .env, logs, etc.), update .gitignore before committing. This prevents accidental commits of sensitive or unnecessary files in the future. Exception: never add image glob patterns (*.png, etc.) — delete or move those instead (see above).
