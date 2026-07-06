# Local Mode (`--local` / `-lo`) — cclogs coordination, no bookkeeping issues

Shared spec for `--local` across `/big-plan`, `/x-wt-teams`, and `/x-as-pr`. Each skill links here by absolute path (`$HOME/.claude/skills/x-wt-teams/references/local-mode.md`) instead of duplicating the layout. `/x` only parses and forwards the flag.

## Why this mode exists

These workflows normally create GitHub issues (an epic + sub-issues, a tracking issue, a `--make-issue` spec) to hold the plan, spec, and step-by-step progress. On a personal / leading repo that paper trail is welcome. On a **public or team repo** those bookkeeping issues read as spam. `--local` keeps the exact same information but writes it to a **cclogs coordination directory** instead of the issue tracker.

Manager↔child coordination does not depend on issues — children hand work back through git merges and Agent-tool return values / SendMessage, and issue comments were only ever an additive human-visible log. So suppressing the issues loses nothing operationally; the cclogs directory restores the durable progress ledger that anti-drift re-reads depend on.

`--no-issue` (an older `/x-wt-teams` flag) is an **alias** of `--local`. Prefer `--local`: bare `--no-issue` drops the progress ledger entirely, whereas `--local` relocates it to `progress.md` so the re-read-after-each-step mechanism still works.

## What is suppressed vs kept

**Suppressed** (these become cclogs files):

- `/big-plan`: the `[Epic]` issue and every `[Sub]` issue.
- `/x-wt-teams`: the tracking issue, its TODO checkoffs, per-step progress comments, claim comment, and session-report comment.
- `/x-as-pr`: the `--make-issue` tracking issue, progress comments, and the review-fix delegation issue.

**Kept — still real GitHub issues:**

- **`agent-found` problem issues.** A genuine bug / regression / improvement found in unrelated code is a legitimate report, not workflow spam, so it is still raised (governed by `-ri` / `-nori` exactly as normal). To silence those too, pass `-nori`.
- The `-f` / auto-fix step still triages and fixes any `agent-found` issues raised this session and opens fix PRs as usual.
- All PRs (draft PR, root PR, topic PRs, fix PRs) — `--local` only touches **issues**, never PRs.

## Coordination directory

Resolve once, at the point where the skill would otherwise create its first issue. `SLUG` is the same slug the skill already derives for branch/PR naming.

```bash
LOGDIR=$(node "$HOME/.claude/scripts/get-logdir.js")   # repo-scoped, Dropbox-synced cclogs dir
LOCAL_DIR="$LOGDIR/local-workflow/$(date +%Y%m%d_%H%M%S)-${SLUG}"
mkdir -p "$LOCAL_DIR"
echo "Local mode: coordination dir = $LOCAL_DIR"   # print it so the user (and any fresh session) can find it
```

Record `LOCAL_DIR`. Everywhere the skill would create / read / comment on an issue, act on a file in `LOCAL_DIR` instead (see the substitution table).

## File set

| File | Written by | Role (issue it replaces) |
|---|---|---|
| `plan.md` | `/big-plan`; also the standalone spec for `/x-wt-teams` / `/x-as-pr` | The epic / tracking / `--make-issue` issue body: Summary, Topics, base branch, wave plan, sub table |
| `sub-NN-<slug>.md` | `/big-plan` (multi-sub plans) | Each `[Sub]` issue body, including the machine-readable marker block |
| `progress.md` | the running skill | The tracking issue's TODO checklist + Progress Log (the durable ledger) |
| `session-report.md` | end of workflow | The Step 14 / session-report issue comment (in addition to the normal `{logdir}` report) |

### `sub-NN-<slug>.md` marker block (must match the issue-body markers exactly)

`/x-wt-teams` greps sub specs for the same marker lines it greps from `[Sub]` issue bodies, so keep the spelling identical:

```markdown
Plan: ./plan.md

---
**Wave:** 1
**Execution mode:** subagents
**Model:** opus
**Depends on:** none
---

<full task spec — what to build, acceptance criteria, files involved>
```

`**Execution mode:**` is `subagents` or `teams`; `**Model:**` is `opus` / `sonnet` / `haiku`; `**Depends on:**` lists sibling sub filenames (e.g. `sub-02, sub-03`) or `none`. These drive the same spawn-path / model / wave-ordering decisions as in issue mode.

### `progress.md` shape

```markdown
# <project> — progress ledger

## TODO
- [ ] Step 1: ...
- [ ] Step 2: ...
      (the same step list the tracking-issue template uses)

## Progress Log
### Step 1: <name> — completed
<concise summary>
```

After each step: flip the `- [ ]` to `- [x]`, append a Progress Log entry, then **re-read `progress.md`** to confirm the next step. This re-read is the anti-drift mechanism that the issue TODO normally provides.

## Substitution table (issue action → `--local` action)

| Normal (issue mode) | `--local` |
|---|---|
| create epic / tracking / `--make-issue` issue | write `plan.md` (+ `sub-NN.md` for `/big-plan` multi plans) into `LOCAL_DIR` |
| `gh issue comment` progress milestone | append a dated entry to `progress.md` |
| check off a TODO in the issue body | edit the `## TODO` in `progress.md` |
| re-read the issue to find "what's next" | re-read `progress.md` |
| `gh issue view` to recover requirements (Step 15 verify) | re-read `plan.md` / the relevant `sub-NN.md` |
| claim comment (prevent concurrent sessions) | skip — no issue to claim |
| session-report issue comment | write `session-report.md` (the normal `{logdir}` report still happens); no issue comment |
| review-fix delegation issue (`/x-as-pr`) | write `fix-spec.md` into `LOCAL_DIR`; point the fix agent at that path instead of a `gh issue view` |
| supersede-close source issues (`/big-plan` existing-issue mode) | leave source issues untouched; reference them textually in `plan.md` |

## Handoff (replaces the issue-URL handoff)

`/big-plan` normally hands off an issue URL (`/x-wt-teams {epic-url}` or `/x-as-pr {sub-url}`). Under `--local` it hands off the **path** instead:

- Multi-sub plan → `/x-wt-teams --local {LOCAL_DIR}`
- Single-sub plan → `/x-as-pr --local {LOCAL_DIR}/sub-01-<slug>.md`

Under `-a`, forward `--local` in the auto-invoke exactly like `-m` / `-nf` / `-nori`. Without `-a`, print the hand-off command with the concrete path so a fresh session can continue.

**Arg detection in `/x-wt-teams` / `/x-as-pr`:** in `--local` mode, an argument that is a filesystem path (starts with `/`, exists on disk, or contains `local-workflow/`) is the plan directory / sub-spec file — read the spec from it instead of `gh issue view`. A `#number` / issue URL still means a real issue even under `--local` (e.g. implementing an existing tracked issue while keeping *this run's* bookkeeping local).
