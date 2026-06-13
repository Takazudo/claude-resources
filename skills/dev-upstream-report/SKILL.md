---
name: dev-upstream-report
description: "Report bugs and improvement ideas found in Takazudo's own upstream packages as GitHub issues on the upstream repo. The current project depends on packages built by the user under github.com/takazudo and github.com/zudolab (e.g. zudolab/zudo-doc, Takazudo/zudo-front-builder, the @takazudo/* npm scope). Use when: (1) User invokes /dev-upstream-report — with a description to report something now, or with no args to enable upstream-watch mode for the rest of the session, (2) During development a bug, limitation, or missing feature is traced to one of these upstream packages rather than the current project, (3) User says 'report upstream', 'upstream issue', 'file it on the package repo', or blames one of these packages for a problem."
argument-hint: "[what to report — leave empty to enable upstream-watch mode]"
---

# Dev Upstream Report

The user's projects depend on packages the user built themselves, hosted under
**github.com/takazudo** and **github.com/zudolab**. When development work
reveals that a bug or a missing capability lives in one of those packages —
not in the current project — the finding belongs on the upstream repo's issue
tracker; otherwise it is lost the moment this session ends. This skill files
that issue and keeps the local dev work moving.

## Invocation modes

**With arguments** (`/dev-upstream-report the formatter drops MDX comments`):
treat $ARGUMENTS as the finding. Identify the upstream package and repo, file
the issue now, report the URL.

**Without arguments**: enable **upstream-watch mode** for the rest of the
session. Confirm activation in one sentence, then continue whatever dev work
is in progress. From now on, whenever a problem traces to an upstream package
under these accounts, file an issue at the moment of discovery — don't batch
findings for the end of the session, and don't silently work around a problem
without recording it. The mode lasts only for the current session.

In both modes, file both **bugs** and **improvements**: awkward APIs, missing
options, confusing docs, and behavior the current project had to hack around
are all worth an issue — the user owns these packages and wants the feedback.

## Step 1: Confirm the problem is upstream

Before filing, verify the root cause is in the dependency, not in how the
current project uses it. Read the package's actual code under
`node_modules/<pkg>/` or its docs to confirm the behavior belongs to the
package. A misread API is not an upstream bug.

## Step 2: Resolve the package to its repo

1. Read `node_modules/<pkg>/package.json` → `repository` field (or run

   `npm view <pkg> repository.url`).

2. If that fails, look for the repo directly:

   `gh repo list takazudo --limit 100` / `gh repo list zudolab --limit 100`.

3. Only file on repos under these two accounts. If the culprit is a

   third-party package, tell the user instead of filing.

Also capture the **installed version** from the lockfile or
`node_modules/<pkg>/package.json` — the issue is meaningless without it.

## Step 3: Check for duplicates

```bash
gh issue list -R <owner>/<repo> --search "<keywords>" --state all --limit 20
```

If an existing issue already covers it, add a comment with the new context
(installed version, repro from this project) instead of opening a duplicate,
and report that URL.

## Step 4: File the issue

```bash
gh issue create -R <owner>/<repo> --title "<concise summary>" --body "<body>"
```

- Apply a `bug` or `enhancement` label if the repo has one

  (`gh label list -R <owner>/<repo>`); skip labels that don't exist.

- If a screenshot or diagram is essential to the report, use

  `/gh-issue-with-imgs` instead of plain `gh issue create`.

Issue body shape:

```markdown
## Context

Found while developing <project name>. Installed version: `<pkg>@<version>`.

## Expected

<what should happen>

## Actual

<what happens instead — include the error message verbatim if there is one>

## Repro

<minimal steps or snippet, reduced to the package's own API,
independent of the current project>

## Suggested fix (optional)

<only if the cause was actually located in the package source>
```

**Privacy**: upstream repos may be public while the current project may be
private or client work. Reduce the repro to the package's API surface — no
client names, private URLs, business logic, or pasted blocks of the current
project's proprietary code.

## Step 5: Keep dev moving

Filing the issue is a side quest — return to the main task immediately after.

- If the bug blocks progress, apply a local workaround and mark it with a

  one-line comment linking the issue: `// workaround for <issue URL>` (this
  is exactly the "context that lives outside the codebase" comment exception).

- Never patch files inside `node_modules/` as the fix.
- If the user would rather fix the package now instead of just reporting,

  point them at `/dev-wip-package-upstream-wt-dev`.

- Include every filed or commented issue URL in the final summary of the

  turn, so the user can review them.
