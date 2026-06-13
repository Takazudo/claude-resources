# Web mode contract (Claude Code on the web)

When `$CLAUDE_CODE_REMOTE=true`, skills run in the cloud container, which differs
from the macOS terminal in five ways. Skills reference this file so the rules
live in one place — keep one copy of each skill and make only these touch points
environment-aware.

## 1. GitHub: MCP, not `gh`

`gh` is not installed and the GitHub API is reachable only through the GitHub
MCP (`mcp__github__*`). Translate every `gh` command to its MCP equivalent per
[`github-ops.md`](./github-ops.md). Two gotchas:

- **Push before creating a PR** — MCP only sees pushed branches.
- **Pre-create labels** (e.g. `epic`, `sub`, `agent-found`) — there is no
  create-label MCP tool.

## 2. Claude-only — no Codex, no Copilot

Codex (`-co` / `/codex-review`) and GitHub Copilot (`-gco` / `/gco-review`) CLIs
are not available in the container. The `codex-review` and `gco-review` skills
are disabled in `settings.web.json`.

- **Ignore `-co` and `-gco` flags.**
- Any step whose default backend is Codex (e.g. `/light-review` and
  `/deep-review` default to `/codex-review`) **defaults to a Claude reviewer
  instead** (Sonnet, or the model set by a `-op`/`-so`/`-haiku` flag).

## 3. Subagents-only — no agent teams

The experimental agent-teams path (`TeamCreate` / `SendMessage` / named
teammates) is not used on web.

- Fan out **one-shot subagents** via the Agent/Task tool instead.
- Where a skill would route to the teams path or delegate fixes to
  `/x-wt-teams` team-fix mode, run the work as plain subagent fan-out (each child
  in its worktree, return on completion — no inter-agent messaging).

## 4. No Dropbox — persist to git or GitHub

Dropbox is not reachable (no MCP, network blocked). `setup-web.sh` stubs
`$DROPBOX_CCLOGS_DIR` / `$DROPBOX_SCREENSHOTS_DIR` to `/tmp`, which is
**ephemeral** — the container is reclaimed after the session.

For anything that must survive the session:

- **Commit it to the repo** (git, or MCP `create_or_update_file` / `push_files`), or
- **Post it to the GitHub issue / PR** (`add_issue_comment`).

`/tmp` is fine only for within-session scratch.

## 5. The session branch IS the base — no `base/<topic>`, no second base level

Web starts each session on its own working branch — `git branch --show-current`
returns `claude/<adjective>-<name>-<hash>` — forked from the branch the user
started the session on (**today always the repo default**, e.g. `main`; a future
non-default start branch is allowed for in the wording below). Treat that session
branch as the **base branch** the skills would otherwise create. This is exactly
the `--stay` / adopt-current-branch case the skills already support, with the
parent fixed to the fork-from branch — **never** create a `base/<topic>` on top
of it, and **never** push an empty start commit.

### Canonical detection — run this, do not assume

Detection is a **branch-shape check**, not an env-var read with the answer
hard-coded. Compute these **once, at the start of the skill** (re-running
`git branch --show-current` after a later `git checkout` returns the wrong
branch — capture into a variable and reuse it):

```bash
# Only meaningful when $CLAUDE_CODE_REMOTE = true; on terminal these are unused.
WEB_DEFAULT=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
WEB_CUR=$(git branch --show-current)        # empty in detached HEAD → hard error, stop
if [ -z "$WEB_CUR" ]; then
  echo "ERROR: detached HEAD on web — cannot determine the session base branch."; exit 1
fi
if [ "$WEB_CUR" = "$WEB_DEFAULT" ]; then
  # Non-adopted / lazy session: the session branch was not (yet) created.
  # Cut ONE claude/<slug> base, check it out (so push==current holds), then push.
  WEB_BASE="claude/<slug>"
  git checkout -b "$WEB_BASE"
else
  WEB_BASE="$WEB_CUR"                        # the adopted claude/* session branch
fi
WEB_PARENT="$WEB_DEFAULT"                    # parent = the branch the session was forked from
```

- **`$WEB_BASE` is the one canonical name.** Each skill already captures the
  current branch into its own variable (`$PARENT_BRANCH` in `/big-plan`,
  `$INVOCATION_BRANCH` in `/x-wt-teams` and `/x-as-pr`). **On web that existing
  variable IS `$WEB_BASE` — do NOT introduce a second live variable.** Where a
  skill's prose says "parent branch" on web, it means `$WEB_PARENT`; where it
  says "base branch", it means `$WEB_BASE`.
- **Parent / root-PR target = `$WEB_PARENT`** — the branch the session was forked
  from (today: the repo default). This **inverts** the terminal rule "root PR
  base = the invocation branch": on web the invocation branch is `$WEB_BASE`, and
  its PR targets `$WEB_PARENT`. **Do NOT run the terminal `--stay`
  `gh pr view <branch> --json baseRefName` preference step** — on web the parent
  is `$WEB_PARENT` unconditionally, even when the session branch already has a PR
  (the "Create PR" button or a prior `claude/*` PR can make that lookup return a
  non-default base, which is wrong here).

### One push/branch rule

- **Push only the branch you are currently checked out on**, and only
  `claude/`-prefixed branches are pushable. **Any branch you create on web MUST
  be `claude/`-prefixed AND pushed only while it is the current branch.** Never
  push a branch you are not on — the web GitHub proxy rejects it. Topic / fix
  branches are merged into `$WEB_BASE` **locally** and are not pushed.
- **Defer the root PR until the first real commit exists.** With no empty start
  commit, `$WEB_BASE` and `$WEB_PARENT` are identical at session start, so
  `create_pull_request(head=$WEB_BASE, base=$WEB_PARENT)` fails with "No commits
  between …". Create the root/draft PR via MCP only **after** the first real
  commit lands on `$WEB_BASE` (or adopt the PR the UI "Create PR" button made,
  via `list_pull_requests` head=`$WEB_BASE`). Push `$WEB_BASE` before the MCP PR
  call.

### Per-skill shape

- **`/x-wt-teams`** — topic worktrees fork from `$WEB_BASE`
  (`git worktree add worktrees/<t> -b <t> "$WEB_BASE"`) and merge back into it
  locally; the root PR is `$WEB_BASE` → `$WEB_PARENT`. No `base/<topic>` layer,
  no per-topic push loop, no per-topic documentation PRs. After the `-m` merge,
  `git checkout "$WEB_BASE"` (it survives — see below) so the manager stays on a
  pushable branch; do NOT stay on `$WEB_PARENT` (it is not pushable).
- **`/x-as-pr`** — commit directly on `$WEB_BASE` (do not branch `topic/<slug>`);
  the PR is `$WEB_BASE` → `$WEB_PARENT`.
- **`/big-plan`** — planning only: the planned base IS the session branch, parent
  = `$WEB_PARENT`. Write issue bodies with the **resolved literal** branch name
  (run `git branch --show-current`, e.g. `claude/serene-galileo-7uqa3g`) — never
  the token `$WEB_BASE`, or the downstream skill's "do NOT invent the base name"
  rule has nothing real to use. The resource-handoff case commits
  `_temp-resource/...` directly onto `$WEB_BASE`.
- **`-m` / merge** — merge `$WEB_BASE` → `$WEB_PARENT` via MCP
  `merge_pull_request`, **without a branch-delete flag**. **Do NOT delete the
  `claude/*` session branch — the web platform owns it.** There is no
  `base/<topic>` to clean up. After merge the work is on `$WEB_PARENT`; the UI's
  "Create PR" button still shows the session branch — tell the user to ignore it.
- **Fix branches** (`-fix` / CI-fix) — name them `claude/agent-fix-<slug>`
  (`claude/`-prefixed so they are pushable), fork from `$WEB_PARENT`, push each
  while it is the current branch, then return to `$WEB_BASE`. These are normal
  `claude/` branches and **may** be merged-and-deleted; only `$WEB_BASE` is
  protected.

### Cleanup protects the session branch by name

When handing a manifest to `/cleanup-resources`, pass the session branch as
`role: session-web` with `protected-session-branch: <its literal name>`. The
audit must **never** delete or check-out-off that exact branch, even when its PR
is merged. Protect it by **name**, not by the `claude/*` prefix — dead
`claude/agent-fix-*` branches still need deleting.

### Not supported on web

- **Super-epic / multi-base stacking is unsupported on web.** It requires real
  `base/<super>` and `base/<super>-<epic>` branches that are neither
  `claude/`-prefixed (unpushable) nor the session branch. A skill that detects
  both `$CLAUDE_CODE_REMOTE=true` and super-epic markers must refuse early and
  tell the user to run super-epics from the terminal. The single-base model does
  **not** collapse the two-base super-epic topology — do not pretend it converges.

The terminal's `--stay`, the "Use this PR as base" resource-handoff reuse, and a
single-base epic all **converge** to this model on web. The two-base super-epic
does not — it is out of scope on web.
