# Web mode contract (Claude Code on the web)

When `$CLAUDE_CODE_REMOTE=true`, skills run in the cloud container, which differs
from the macOS terminal in four ways. Skills reference this file so the rules
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
