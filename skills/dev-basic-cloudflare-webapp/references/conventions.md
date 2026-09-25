# Repo Conventions

Layout, documentation, and the agent-workflow affordances every repo carries.

## Contents

- [Directory layout](#directory-layout)
- [Documentation files](#documentation-files)
- [The docs site](#the-docs-site)
- [.gitignore](#gitignore)
- [Worktrees](#worktrees)
- [Scratch and log directories](#scratch-and-log-directories)
- [.claude/](#claude)
- [Git and branches](#git-and-branches)

## Directory layout

```
.github/workflows/     ci.yml, deploy.yml, actionlint.yml, security.yml
.claude/               project skills, settings, agents
docs/                  cloudflare-setup.md, ops runbooks (markdown, not the site)
doc/ or docs/          the built documentation site (zfb + zudo-doc)
pages/                 zfb file-based routes
components/            Preact/React components
layouts/               page layouts
lib/                   shared logic (worker-safe)
styles/                global.css, design tokens
src/                   app source when the project is not zfb-shaped
workers/<name>/        one deployable Worker each, own wrangler config
packages/<name>/       first-party workspace packages
migrations/            numbered D1 SQL
scripts/               repo automation: run-b4push.sh, smoke.mjs, install-git-hooks.sh
e2e/                   Playwright specs
worktrees/             agent worktrees (gitignored)
```

When both a markdown-docs folder and a docs *site* exist, one must be renamed —
`docs/` for prose, `doc/` for the site is the common split.

## Documentation files

| File | Contents |
| --- | --- |
| `README.md` | What it is, live URL, setup from a fresh checkout, the commands |
| `CLAUDE.md` | Repo rules for agents — see below |
| `CONTRIBUTING.md` | New-machine setup, local-package escape hatches |
| `docs/cloudflare-setup.md` | The ordered from-zero provisioning walkthrough |
| `TESTING.md` | Test levels, tiers, tag taxonomy — once the suite outgrows a paragraph |
| `CHANGELOG.md` | Only for published packages |

### CLAUDE.md

The repo's operating manual for agents. A working outline:

```md
# <project> — repo rules

One-paragraph description and the current architecture contract.

## Tech Stack
Bullet per major dependency, each saying *why* it is there and what not to add
alongside it.

## Commands
Every script worth running, with its ports, its prerequisites, and its traps.

## Automation
What runs by itself — lefthook hooks, prepare, generated files.

## Key Directories

## CI Pipeline
Which workflow does what, and what deploys where.

## Testing
Point at TESTING.md rather than duplicating it.

## Directory-scoped CLAUDE.md files
List them, so an agent knows they exist before it needs one.
```

Two rules that keep it useful:

- **Write down the traps.** A `CLAUDE.md` earns its tokens by recording what
  cannot be recovered by reading the code — an ordering constraint, a config
  field that is silently ignored when misplaced, a version that broke something.
  The same test applies as for code comments: if deleting the line means the
  next reader cannot recover the meaning, keep it.
- **Directory-scoped files auto-load.** Put component/CSS rules in
  `src/CLAUDE.md`, content-authoring rules in `src/content/CLAUDE.md`, Playwright
  architecture in `e2e/CLAUDE.md`. The root file only lists them.

## The docs site

Public-facing docs are a zudo-doc site under `doc/`, deployed to
`<project>.<domain>` as its own Workers deploy. `doc/zfb.config.ts` calls
`zudoDoc({ siteName, siteDescription, siteUrl, headerNav, adapter, ... })`; a
generated project keeps that to a single diff-from-defaults file.

Add `check:html` (`html-validate "dist/**/*.html"`) and `check:links`
(`linkinator ./dist --recurse --skip '^https?://'`) as CI steps so the docs
build cannot land broken.

## .gitignore

```
node_modules/
dist/
.zfb/
.zfb-build/
.wrangler/
worktrees/
test-results/
playwright-report/
__inbox/
.dev.vars
.env
.DS_Store
```

Commit `.env.example` / `.dev.vars.example` listing the variable names with
placeholder values.

## Worktrees

`/x-wt-teams` runs child agents in git worktrees under `worktrees/`.

**Pushing from a worktree is forbidden.** CI runs on every push, so children
pushing pre-empts the manager's merge-and-review step and multiplies CI cost
across intermediate state. Only the manager session, at the repo root, pushes.

Enforce it with a `.git/hooks/pre-push` guard installed by
`scripts/install-git-hooks.sh`, run from both `prepare` and an `init-worktree`
script (a fresh worktree has its own hooks path). Document the emergency bypass
for human use in `CLAUDE.md`.

## Scratch and log directories

- Agent logs and artifacts → the repo-scoped cclogs dir
  (`$DROPBOX_CCLOGS_DIR/<repo-name>/`), which is Dropbox-synced so it survives
  switching machines.
- WIP, prototypes, worktree prompts → the same cclogs dir. `__inbox/` is
  retired; keep it only for a prototype that must import the repo's production
  code or use its Vite/workspace tooling so relative imports resolve.
- `_temp-resource/` for epic resource handoff scratch, gitignored.
- Never write `~` into a path — use `$HOME` or the `{logdir}` placeholder.

## Git and branches

- `main` is the default branch. Regular merge, not squash.
- Long-lived epic integration branches are `base/**`; include them in CI branch
  filters.
- Named preview branches are `preview` and `expreview/**`.
- No force push, no `--amend`, no branch-name reuse.
- Commit with `/co`; open PRs with `/pr`; land them with `/prc`.
