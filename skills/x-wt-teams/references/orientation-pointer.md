# Orientation pointer — surviving context compaction

Shared spec for the session orientation pointer, used by `/x-wt-teams`, `/x-as-pr`, and `/big-plan`. Each skill links here by absolute path (`$HOME/.claude/skills/x-wt-teams/references/orientation-pointer.md`) instead of duplicating it — same arrangement as [`local-mode.md`](local-mode.md).

## Why this exists

These workflows run for hours in a single manager session. Somewhere in the middle, the context gets compacted — and the compaction summary is prose. It reliably keeps "we are implementing dark mode" and reliably loses "we are at Step 11, topics 1 and 3 are merged, topic 2's child is parked, the tracking issue is #4127."

The progress ledger itself is never lost: it is a GitHub tracking issue, or `progress.md` in a local-mode coordination dir. What is lost is the **pointer to it** — after compaction the session no longer knows the issue number, so it cannot re-read the one document that would tell it where it was. It then re-runs finished steps, re-creates branches that exist, or quietly drifts.

Post-compaction, Claude Code auto-restores recently-read *files* under a token budget, so a `progress.md` the manager reads every step partially survives on its own. A tracking issue read through `gh` is not a file and gets no such treatment — **issue mode is the leaky case**, and the reason this pointer exists.

## The mechanism

`$HOME/.claude/hooks/compact-reorient.sh` is wired to two events in `settings.json`. Both behaviors were verified against the Claude Code binary, not the public docs (which are ambiguous here and imply the opposite):

| Event | What the hook's output does |
|---|---|
| `PreCompact` | stdout becomes `newCustomInstructions`, merged into the summarization prompt — it tells the summarizer what it must not drop |
| `SessionStart` matcher `compact` | fires again during the post-compaction context rebuild; results are spliced into the new message list as `hookResults`, so `hookSpecificOutput.additionalContext` is read by the model |

`PostCompact` is deliberately unused. It fires at exactly the right moment and even receives the summary, but its handler returns only `userDisplayMessage` — terminal output for the user that the model never sees. It is the obvious-looking wrong answer.

SessionStart hooks are skipped for subagents, so this only ever fires for the **manager** session. Child agents are short-lived and hand work back through git plus a SendMessage report, so they do not need it.

The hook is silent unless it finds live workflow state, and ignores a pointer that is stale (>7 days), `complete`, or written for a different repository — a confidently wrong tracker is worse than no tracker.

## The contract

One helper writes the pointer; the skills never hand-roll JSON:

```bash
node "$HOME/.claude/scripts/orientation.js" begin --workflow x-wt-teams --issue "$ISSUE_NUMBER" --repo "$REPO"
node "$HOME/.claude/scripts/orientation.js" set --step "Step 5: spawn child agents"
node "$HOME/.claude/scripts/orientation.js" complete
```

| Command | When |
|---|---|
| `begin` | once, at the point the skill resolves its tracker. **Clears the previous run's fields** — without it, a second workflow in the same session inherits the first one's issue and PR, and the hook points at the wrong tracker |
| `set` | at each step boundary, where the skill already checks off the TODO and re-reads the tracker. Merges, so pass only what changed |
| `complete` | at the end of the workflow. The record is kept, and the hook then says "this finished, do not resume it" — more useful after a compaction than the pointer simply vanishing |
| `clear` | rarely — only to abandon a run outright |

Flags: `--workflow --issue --issue-url --repo --local-dir --base-branch --branch --pr --step --note`. Unknown flags exit 2, so a typo is caught at authoring time rather than writing a field the hook never reads.

The helper is keyed on `CLAUDE_CODE_SESSION_ID` (note: **not** `CLAUDE_SESSION_ID`, which Claude Code does not set). With no session id it exits 0 in silence, and every failure path is non-fatal — a bookkeeping helper must never break the workflow step that called it.

## What goes in it

**Pointers, not progress.** The pointer says *where to look*; the tracker holds the actual state. Do not mirror the TODO checklist, per-topic status, or a progress narrative into it — that duplicates the ledger and immediately goes stale. `--step` is a breadcrumb ("Step 11: push"), not a report.

The pointer file lives in `$HOME/.claude/orientation/` (gitignored, machine-local) and is pruned after 7 days.

## Where each skill calls it

| Skill | `begin` | `set --step` | `complete` |
|---|---|---|---|
| `/x-wt-teams` | Step 1, right after `ISSUE_NUMBER` / `LOCAL_DIR` is resolved | at each per-step TODO check-off | Step 16, after the cleanup audit |
| `/x-as-pr` | after the tracker is resolved (linked issue, `--make-issue`, or `LOCAL_DIR`) | at each post-implementation step | after the cleanup audit |
| `/big-plan` | step 7, once the epic issue (or local plan dir) exists | when it hands off to an implementation skill | when the plan session ends without chaining onward |

In local mode pass `--local-dir "$LOCAL_DIR"` instead of `--issue`; everything else is identical.
