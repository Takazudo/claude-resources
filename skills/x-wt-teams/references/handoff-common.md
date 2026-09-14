# Hand-off rules common to `-toco` and `-tocl`

Invariants shared by both hand-off modes — **implement on Codex CLI** (`-toco` / `--to-codex`, see [`codex-handoff.md`](codex-handoff.md)) and **implement in a fresh Claude Code session** (`-tocl` / `--to-claude`, see [`claude-handoff.md`](claude-handoff.md)).

Everything here applies to both. Anything target-specific — the composer vs argv, the `$` prefix, which startup prompts exist, why a fresh session is wanted at all — lives in the two target files, which each stand alone otherwise.

## A hand-off replaces local work; it never adds to it

Nothing is implemented in this session after the hand-off, so there is no double-implementation risk — and no reason to leave artifacts behind for a session that will make its own.

## Where it fires — the one real difference between callers

| Caller | Fires | Why |
| --- | --- | --- |
| `/x-as-pr`, `/x-wt-teams` | **At the start**, before any branch, PR, or worktree is created | There is no artifact to produce — the whole job goes elsewhere, and a local branch would be stray |
| `/big-plan` (via `/tocodex` / `/toclaude`) | **At the end** (Step 11, in place of the auto-invoke) | Planning produces the epic + sub-issues the target needs, so it must finish first |

Getting this wrong is the failure mode to avoid: an implementation skill that creates its branch first and *then* hands off leaves a dead branch and a confusing half-started PR. `/x-wt-teams` is worse still — worktrees stranded on disk with no session to clean them up.

## Which flags travel

Forward **`-a` / `-m` / `-nf` / `-nori` / `-lo`** when they were passed, and nothing else.

- **Do not forward reviewer flags** (`-co`, `-nor`) — those are the receiving session's own choice.
- **Do not forward `-s` / `--stay`** — the receiving session picks its own branch. Ignore it and say so.
- **`-v` does not travel** either.
- **Forward only what was typed.** `-m` merges and `-a` runs unattended; neither is something to start on someone's behalf because it would have been convenient.

### Never forward the hand-off flag itself

Strip `-toco` / `--to-codex` and `-tocl` / `--to-claude` out of the command you build. A hand-off command that still carries one makes the receiving session open *another* window and hand off again — recursively. The flag has already done its job by the time the command is being written.

### `-toco` and `-tocl` are mutually exclusive

They name two different places to do the same single job. If both are present, do **not** guess and do **not** open two windows: say which two flags collided and stop, so the user picks one.

## Prefer an issue number over prose

- **Prefer a bare issue number** over a URL — the receiving session resolves it against the repo it was launched in.
- **No issue?** Send the instruction text itself.
- **With `--make-issue`, create the issue here first** and send its number. This is the one resource a hand-off is allowed to create before handing over: the issue is the better spec, it outlives the session, and it is what the receiving session would otherwise have to be told in prose.
- **Local mode (`-lo`)** — forward `-lo` and send the plan **path** instead of an issue number (`{LOCAL_DIR}`, or `{LOCAL_DIR}/sub-01-<slug>.md` for a single topic).

## Long prompts go in a file

Write the prompt to a cclogs file and send `Read and follow the instructions in <PROMPT_FILE>.` when it is multi-line or longer than ~500 characters — headings, bullet lists, code blocks, acceptance criteria.

```bash
PROMPT_DIR="$(node "$HOME/.claude/scripts/get-logdir.js")/<tocodex|toclaude>"
mkdir -p "$PROMPT_DIR"
PROMPT_FILE="$PROMPT_DIR/$(date +%Y%m%d_%H%M%S)-<slug>.md"
```

This keeps the spec self-contained and reviewable, and keeps the launch command short. Write it as a **spec, not a transcript**: the receiving session cannot see this conversation, so the goal, the files involved, the constraints agreed here, and what "done" looks like all have to be in the file. Reference other repos as `$HOME/repos/...`, never machine-absolute paths — cclogs is Dropbox-synced, so the path resolves on either machine. **Confirm the file exists before launching** — a hand-off pointing at a path that was never written starts a session with nothing to read.

A skill invocation is always one short line and never needs a file — the spec already lives in the issue.

## Terminal-only — but "inert" means different things

Both modes need tmux plus the target CLI on PATH, so neither works on Claude Code on the web. What happens there is **not** the same for the two kinds of caller, and the difference is deliberate:

| Caller | On web |
| --- | --- |
| `/x-as-pr`, `/x-wt-teams`, `/big-plan` with the flag | The flag is **inert** — the skill implements normally. The user asked for the work; the destination was a preference |
| `/tocodex`, `/toclaude` standalone | **Surface the launch script's message and stop.** Do not silently implement locally — the hand-off *is* the request, so doing the work here is the opposite of what was asked |

## After handing off

- **Run `node "$HOME/.claude/scripts/orientation.js" complete`.** Never leave the pointer active for the new session to "adopt" — it cannot read it. (`orientation.js show` tells you whether a run is active. Skip this when a standalone `/tocodex` / `/toclaude` was a side errand in a session that continues on other work.)
- **Create nothing else** — no branch, no PR, no worktree, no tracking issue for work that now belongs elsewhere. (The `--make-issue` issue above is the sole exception, and it is created *before* the launch.)
- **Skip the cleanup audit** — there are no resources to audit.
- **Report** the window name, the exact command sent, and whether it was submitted or is waiting on the user.
- **Surface a failed launch verbatim.** Every nonzero exit except 64 prints a command the user can run by hand; 64 means the skill built the invocation wrong, so fix the call rather than handing the user a fallback.
