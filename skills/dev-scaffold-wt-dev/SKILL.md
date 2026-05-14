---
name: dev-scaffold-wt-dev
description: "Scaffold the /x-wt-teams worktree-development setup into the current repo: a pre-push git hook that blocks pushes from worktrees/, an installer wired into pnpm/npm install, lefthook for pre-commit hooks, and a root CLAUDE.md section documenting the policy. Use when: (1) User says 'scaffold wt-dev', 'install worktree push guard', 'set up x-wt-teams here', 'add wt-dev to this repo', 'block worktree pushes', (2) Preparing a new repo for /x-wt-teams multi-topic development, (3) The user wants child agents in worktrees to be mechanically prevented from pushing instead of relying on prompt instructions."
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Scaffold worktree-development setup (`wt-dev`)

Install the repo-scoped pieces that make `/x-wt-teams` reliable:

- **lefthook** manages pre-commit hooks via `lefthook.yml` (lint-staged wired in only if the repo already uses it)
- **A direct pre-push guard** in `.git/hooks/pre-push` blocks pushes from worktrees — deliberately NOT in `lefthook.yml` because lefthook reads config from the worktree's toplevel and would silently skip the guard when invoked from inside a worktree
- **`scripts/install-git-hooks.sh`** installs the pre-push guard idempotently; wired into `prepare` and `init-worktree`
- **Root `CLAUDE.md` section** documents the policy for agents

All four pieces are tightly coupled — install all of them, not a subset.

## Workflow

### Step 1: Pre-flight checks

Run from the target repo root:

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Not a git repo"; exit 1; }
ls package.json 2>/dev/null
ls .git/hooks/pre-push 2>/dev/null
grep -q "^worktrees/" .gitignore 2>/dev/null && echo "(worktrees/ already gitignored)"
ls lefthook.yml 2>/dev/null && echo "(lefthook.yml already exists)"
cat package.json | python3 -c "import json,sys; p=json.load(sys.stdin); print(p.get('scripts',{}).get('prepare','(no prepare)'))"
```

Decide:

- **No `package.json`:** the `prepare` lifecycle hook doesn't apply. Install lefthook globally or document manual steps. Continue with the scaffold but skip Step 4.
- **Pre-existing `.git/hooks/pre-push` without our marker:** tell the user; if they confirm, move it aside (`mv .git/hooks/pre-push .git/hooks/pre-push.bak`) before running the installer.
- **`core.hooksPath` is set (e.g. to `.husky/_`):** must be unset first. Edit `.git/config` to remove the `hooksPath` line under `[core]`. Without this, neither lefthook's hooks nor the pre-push guard will fire.
- **`lefthook.yml` already exists:** merge the pre-commit block into it rather than overwriting (Step 3).
- **`worktrees/` not in `.gitignore`:** add it as part of Step 5.

### Step 2: Copy the scripts

Copy these two files from the skill assets to the target repo. Preserve executable bits.

```bash
SKILL_DIR="$HOME/.claude/skills/dev-scaffold-wt-dev"
mkdir -p scripts/hooks
cp "$SKILL_DIR/assets/scripts/hooks/pre-push" scripts/hooks/pre-push
cp "$SKILL_DIR/assets/scripts/install-git-hooks.sh" scripts/install-git-hooks.sh
chmod +x scripts/hooks/pre-push scripts/install-git-hooks.sh
```

Both files are repo-agnostic — no patching needed.

### Step 3: Create or update `lefthook.yml`

First, detect whether this repo already uses `lint-staged`. Any of these is a signal that lint-staged is configured:

```bash
# Config files at the repo root
ls .lintstagedrc .lintstagedrc.{js,cjs,mjs,json,yaml,yml} lint-staged.config.{js,cjs,mjs} 2>/dev/null
# Top-level "lint-staged" key OR lint-staged listed as a (dev)dependency in package.json
[ -f package.json ] && python3 -c "import json; p=json.load(open('package.json')); print('yes' if 'lint-staged' in p or 'lint-staged' in (p.get('dependencies') or {}) or 'lint-staged' in (p.get('devDependencies') or {}) else 'no')"
```

**If lint-staged is configured** — create `lefthook.yml` with the lint-staged command:

```yaml
pre-commit:
  commands:
    lint-staged:
      run: pnpm dlx lint-staged
```

**If lint-staged is NOT configured** (the common case for new repos) — create `lefthook.yml` with an empty slot. Do NOT default-include `lint-staged: pnpm dlx lint-staged`; without a config it fails every commit:

```yaml
# lefthook manages pre-commit hooks here. Add commands under
# `pre-commit.commands` when this repo needs them, e.g. lint-staged.
#
# The pre-push worktree guard is intentionally NOT managed by lefthook —
# it lives in scripts/hooks/pre-push and is installed directly to
# .git/hooks/pre-push by scripts/install-git-hooks.sh (run by `pnpm install`
# via the `prepare` script). See CLAUDE.md "Worktree push policy" for the
# rationale.

pre-commit:
  commands: {}
```

If `lefthook.yml` already exists, leave its existing `pre-commit` block alone (do not overwrite, do not inject lint-staged). Add a `pre-commit` block only if one isn't there. Do NOT add a `pre-push` block — the guard runs outside lefthook for the reason stated above.

### Step 4: Detect the package manager

For repos with `package.json`:

```bash
[ -f pnpm-lock.yaml ] && PM=pnpm
[ -f package-lock.json ] && PM=npm
[ -f yarn.lock ] && PM=yarn
[ -f bun.lockb ] && PM=bun
PM=${PM:-pnpm}
```

Set:

- `INSTALL_COMMAND` → `${PM} install`
- `INIT_WORKTREE_COMMAND` → `${PM} run init-worktree` (npm/yarn/bun) or `pnpm init-worktree` (pnpm shorthand)

### Step 5: Wire `package.json` scripts (skip if no package.json)

Add two scripts. Use the Edit tool — preserve key order, do not rewrite the whole file:

```json
{
  "scripts": {
    "prepare": "lefthook install && bash scripts/install-git-hooks.sh",
    "init-worktree": "bash scripts/install-git-hooks.sh"
  }
}
```

If the repo already has a `prepare` script:
- **`pnpm dlx husky` (Husky):** replace it entirely (migrate to lefthook). Remove `.husky/` directory. Tell the user.
- **Any other value:** prepend with `&&`: `"prepare": "<existing> && lefthook install && bash scripts/install-git-hooks.sh"`. Tell the user.

### Step 6: Install lefthook as a dev dependency (skip if no package.json)

```bash
# pnpm
pnpm add -Dw lefthook

# npm
npm install -D lefthook

# yarn
yarn add -D lefthook
```

### Step 7: Add or extend root `CLAUDE.md`

Read `$HOME/.claude/skills/dev-scaffold-wt-dev/assets/claude-md-section.md`. Substitute the placeholders:

- `<INSTALL_COMMAND>` → from Step 4
- `<INIT_WORKTREE_COMMAND>` → from Step 4

Then:

- **No `CLAUDE.md` at repo root:** create it. Add a one-line top heading (`# <repo-name> — repo rules`) before the worktree section.
- **`CLAUDE.md` exists but has no worktree section** (grep for `Worktree push policy`): append the section to the end with a blank line before it.
- **Worktree section already present:** report idempotently — "CLAUDE.md already has the worktree policy section; skipping." — and do not duplicate.

Also add `worktrees/` to `.gitignore` if not already present:

```bash
grep -q "^worktrees/" .gitignore 2>/dev/null || echo "worktrees/" >> .gitignore
```

### Step 8: Run the installer and verify

```bash
bash scripts/install-git-hooks.sh
```

Expected: `install-git-hooks: installed <path>/.git/hooks/pre-push`.

Verify the guard works. Create a throwaway worktree, attempt a push, confirm it's blocked, then clean up:

```bash
git worktree add worktrees/_pushguard-poc -b _pushguard-poc 2>&1 | tail -2
cd worktrees/_pushguard-poc
git commit --allow-empty -m "test"
git push origin _pushguard-poc 2>&1 | head -5
# Expected: 'Push blocked — you are in a /x-wt-teams worktree.' and exit non-zero.
cd ../..
git worktree prune
git branch -D _pushguard-poc
```

If the push isn't blocked, diagnose:

- `.git/hooks/pre-push` exists and is executable?
- `core.hooksPath` is unset (check `cat .git/config | grep hooksPath`)?
- `git rev-parse --git-dir` and `--git-common-dir` differ inside the worktree?

### Step 9: Report

Tell the user concisely:

- Files touched: `scripts/install-git-hooks.sh`, `scripts/hooks/pre-push`, `lefthook.yml`, `package.json` (if applicable), root `CLAUDE.md`, `.gitignore`.
- That the verification worktree push was blocked as expected.
- That nothing was committed — they should `git add` and commit when they're ready.

## Idempotency

Re-running this skill on a repo that already has it scaffolded is safe:

- `cp` overwrites script files with identical content (no diff on first re-run; pulls updates if the skill has been updated upstream).
- `package.json` changes are idempotent — Edit tool will be a no-op if the keys are already present with the right values.
- CLAUDE.md detection (Step 7) skips when the section is already present.
- The installer is idempotent.

## When NOT to use this skill

- The repo doesn't use `/x-wt-teams` at all. The hook is harmless but the CLAUDE.md section talks about a workflow that's not in play.
- The repo has a non-standard `worktrees/` layout (e.g., worktrees elsewhere on disk). The hook's detection uses `GIT_DIR != GIT_COMMON_DIR` (any linked worktree), so path naming doesn't matter for detection — but the CLAUDE.md section references `worktrees/` as the convention.
