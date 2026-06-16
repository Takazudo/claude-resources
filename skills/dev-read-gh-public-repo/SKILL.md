---
name: dev-read-gh-public-repo
description: "Read files from a PUBLIC GitHub repo that the Claude Code web/remote environment reports as out-of-scope for its GitHub MCP tools. Use when (1) running in the web/remote container (claude.ai/code, NOT a local Mac/terminal session), AND (2) a `mcp__github__*` call fails with \"Access denied: repository ... is not configured for this session\", AND (3) the repo is public. Triggers: \"can't see that repo\", \"access denied repository not configured\", \"read a public repo that's not in scope\", \"clone a public repo to read it\"."
---

# Read a public GitHub repo that's out of MCP scope

## The problem

In the Claude Code **web/remote** environment, the GitHub MCP tools (`mcp__github__*`)
are locked to an allow-list of repos chosen when the session was created. Reading any
other repo — even a public one — fails like this:

```
Access denied: repository "owner/name" is not configured for this session.
Allowed repositories: <only-the-scoped-ones>
```

Choosing "add repo to scope" in the UI does **not** take effect mid-session, and the
`mcp__claude-code-remote__list_repos` / `add_repo` tools are often unavailable. So the
MCP path is a dead end here.

## The fix (public repos only)

Bypass MCP entirely — clone over HTTPS into an ephemeral dir, then use the normal
Read / Grep tools:

```bash
cd /tmp && git clone --depth 1 https://github.com/<owner>/<repo>.git
# now Read / Grep files under /tmp/<repo>
```

## Gotchas

- **HTTPS only — SSH fails.** There is no `ssh` binary in the container, so

  `git clone git@github.com:owner/repo.git` dies with `ssh: not found`. Always use
  the `https://github.com/...` URL.

- **No auth needed for public repos** over HTTPS — the clone just works, assuming the

  environment's outbound network policy allows github.com.

- **Clone outside the working repo** (`/tmp`, or any path that isn't the user's

  project) so the checkout stays ephemeral and never gets committed by accident.

- `--depth 1` keeps it fast; drop it only if you need history.

## Limits — don't misapply

- **Reading only.** This is for research: reading a doc/spec, copying a pattern. It

  grants no write access and is not a substitute for proper repo scope.

- **Public repos only.** Private repos still require adding the repo to the session

  scope (or real auth) — a plain HTTPS clone will prompt for credentials and fail.

- **Web/remote env only.** On a normal local session, just use `gh` or an existing

  checkout instead — don't reach for this.
