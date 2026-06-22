---
name: issue-sweep
description: >-
  Sweep open GitHub issues — optionally narrowed by label — and drive each to completion via
  `/big-plan -m -a`. Collects candidates, triages out work that needs careful human judgment,
  confirms once, then handles the rest autonomously one issue at a time. Use when: (1) User says
  '/issue-sweep', 'sweep issues', 'sweep open issues', 'handle the open issues', 'clear the issue
  backlog', or 'do the issues', (2) The user wants to batch-process a label's worth of issues
  (e.g. `agent-found`, `mac`), (3) After a work round that left a pile of follow-up issues.
  Options: `-f`/`--filter LABEL` keeps only issues carrying that label; `-ex`/`--exclude LABEL`
  drops issues carrying it; with no options it sweeps ALL open issues. Skips issues that need
  careful human judgment (huge multi-major version bumps, super-big epics, design calls).
user-invocable: true
argument-hint: "[-f|--filter LABEL] [-ex|--exclude LABEL]"
---

# issue-sweep — Sweep & Handle Open GitHub Issues

## Overview

Collect open GitHub issues (optionally filtered by label), triage out the ones that need careful
human judgment, confirm the plan once, then drive each remaining issue to completion with
`/big-plan -m -a`.

There is exactly one human checkpoint: the confirmation in Step 3. Everything after it runs
autonomously per `-a`.

## Options

| Flag  | Alias       | Meaning                                      | Example                  |
| ----- | ----------- | -------------------------------------------- | ------------------------ |
| `-f`  | `--filter`  | Keep only issues that carry the given label  | `/issue-sweep -f mac`    |
| `-ex` | `--exclude` | Drop issues that carry the given label       | `/issue-sweep -ex deferred` |

- Each flag accepts a comma-separated list (`-f a,b`) or may be repeated.
- `--filter` maps to gh's native `--label` (AND semantics — an issue must carry every filter
  label). `--exclude` is applied client-side — an issue is dropped if it carries ANY excluded
  label.
- Flags compose: `/issue-sweep -f agent-found -ex deferred`.
- **No defaults.** With no flags, every open issue is a candidate.

## Step 1: Collect candidate issues

Build the list from the parsed flags. Start from open issues, add one `--label` per filter
label, then drop excluded labels client-side.

```bash
# -f agent-found -ex deferred  →
gh issue list --state open --label agent-found \
  --json number,title,labels,url --limit 200
```

Then drop any issue whose labels include an excluded label. If the remaining set is empty, report
"No issues to sweep" and stop.

With no `-f`, the candidate set is **all open issues** — surface the count to the user so the
scale of the sweep is clear before triaging.

## Step 2: Triage — handle vs skip

For each candidate, read its concrete detail with `/gh-fetch-issue <number>` (this downloads
embedded screenshots so they are actually readable — plain `gh issue view` cannot show them).

Classify each issue:

- **Handle** — well-scoped, normal-sized work the autonomous chain can finish safely.
- **Skip** — needs careful human judgment. Leave it open (do **not** auto-add a `deferred` label
  — suggest it instead). Skip when the issue is:
  - a large multi-major dependency / version bump (e.g. "bump X from 1 → 4"),
  - a super-big epic (an `[Epic]` issue, or one that would fan out into many sub-issues),
  - any change whose correctness hinges on a design decision a human should make.

When unsure whether something is "too big," lean toward **Skip** and surface it in Step 3 rather
than autonomously running it.

## Step 3: Confirm with the user

Present a triage table before doing anything irreversible:

- **Will handle**: `#N` — title — one-line scope
- **Will skip**: `#N` — title — reason

Get explicit confirmation (use `AskUserQuestion`) before launching. This is the single human
checkpoint.

## Step 4: Handle each issue via `/big-plan -m -a`

Process the **handle** list **one issue at a time** — each issue is independent, so batching them
into a single `/big-plan` run would conflate unrelated work into one epic. (Two issues covering
the obviously-same surface may be grouped, but one-at-a-time is the default.)

For each issue:

1. Invoke `/big-plan -m -a <issue-url>`.
   - `-a` runs plan → create sub-issues → implement → review autonomously.
   - `-m` merges the resulting PR into the invocation branch, then cleans up and watches base CI
     (auto-fixing on red).
2. Let it finish before starting the next issue.

Notes:

- Run the sweep from the branch where this work should land (e.g. a long-lived release-candidate
  branch), not directly on a protected production branch.
- Some issues are "verify X" tasks. If verification shows the current state is already correct,
  `-a` will find nothing to implement — in that case verify directly (`/verify-ui` or
  `/headless-browser`) and close the issue with a short note instead of forcing an empty PR.
- If a `/big-plan` run fails or stalls, stop, report which issue, and let the user decide before
  continuing the rest.

## Step 5: Final report

Summarize the sweep:

- **Handled & merged**: `#N` …
- **Verified & closed** (no code change needed): `#N` …
- **Skipped** (with reason): `#N` …
- **Failed / needs attention**: `#N` …
