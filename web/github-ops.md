# GitHub operations on the web (`gh` → GitHub MCP)

On Claude Code on the web, `gh` is **not installed** and `api.github.com` is
unreachable except through the **GitHub MCP server** (`mcp__github__*`), which
the platform provides pre-authenticated. Skills that shell out to `gh` in the
terminal must, on web, route GitHub work through these MCP tools.

This file is the **single source for that mapping** so the divergence lives in
one place: ported skills keep one copy of their orchestration logic and only
their GitHub-call layer becomes environment-aware. It is the GitHub detail
behind the broader [`web-mode.md`](./web-mode.md) contract.

## Mapping

| Terminal (`gh`) | Web (MCP tool) |
|---|---|
| `gh issue create` | `issue_write` (action: create) |
| `gh issue edit --body` | `issue_write` (action: update) |
| `gh issue view` | `issue_read` |
| `gh issue list` | `list_issues` |
| sub-issue linking | `sub_issue_write` |
| `gh issue comment` | `add_issue_comment` |
| `gh issue edit --add-label` | `issue_write` (set `labels`) |
| `gh issue close` | `issue_write` (action: update, `state: closed`) |
| `gh pr create --base <branch>` | `create_pull_request` (`base` = the target/invocation branch — **not** assumed `main`; honor the PR-target rule in `/x` & `/x-as-pr`) |
| `gh pr view` / `gh pr view --json baseRefName` | `pull_request_read` |
| `gh pr list --head <branch>` | `list_pull_requests` (`head` filter) |
| `gh pr merge` | `merge_pull_request` |
| `gh pr checks` (CI) | `pull_request_read` (`get_check_runs` for check status) + `actions_*` / `get_job_logs` |
| `gh label create` | *(no MCP equivalent — see gaps)* |

## Gaps & nuances

- **No create-label tool.** There is `get_label` but nothing to *create* a
  label. Skills bootstrap labels (`epic`/`sub` in `big-plan`, `agent-found` in
  the review skills) with `gh label create`. On web: pre-create the needed
  labels on the repo once (manually), or skip labeling. `issue_write` can still
  *apply* labels that already exist.
- **Push before PR.** The container's git remote is a scoped `local_proxy`
  mirror. Commit locally, `git push -u origin <branch>`, **then** the branch is
  visible to MCP and `create_pull_request` works. MCP `list_branches` does not
  see an unpushed branch.
- **Repo scope.** MCP starts scoped to the session's repo. For cross-repo work,
  add the target repo via the platform's `add_repo` before issue/PR calls.
- **Reviewers & teams.** The Codex reviewer and the agent-teams path are
  not used on web — see rules 2 & 3 of [`web-mode.md`](./web-mode.md)
  (Claude-only reviewers, subagent fan-out instead of teams).

## How ported skills should use this

Keep **one** copy of each skill. Where the terminal path runs `gh ...`, gate on
`$CLAUDE_CODE_REMOTE` (or detect MCP availability) and perform the
MCP-equivalent from the table above. Only this GitHub-call layer is
environment-aware — the planning / wave-sequencing / worktree orchestration
stays shared, so day-to-day edits never touch the web fork.
