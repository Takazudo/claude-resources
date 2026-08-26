# Codex Handoff (`-toco` / `--to-codex`) — implement on Codex CLI instead of here

Shared spec for `-toco` in `/x-wt-teams` and `/x-as-pr`. Both link here by absolute path (`$HOME/.claude/skills/x-wt-teams/references/codex-handoff.md`) instead of duplicating it. `/x` only parses and forwards the flag.

**`/big-plan -toco` no longer uses this path — it delegates to the `/tocodex` skill.** Its hand-off fires at the *end* of a session that produced an epic, which makes it the same job the user does by hand after a `-po` plan; `/tocodex` is that job as a standalone skill. The two implementation skills keep their hand-off here because theirs fires at the *start*, before a branch exists, and routing it through another skill would only add a hop. Two consequences: `/tocodex` **submits by default** (the user asked for the hand-off) where this path submits only under `-a`, and `/tocodex` accepts free-text prompts, which this path never needs to.

## Why this mode exists

The user plans on Claude Code and implements on Codex CLI. Without `-toco` that means closing the Claude session and starting Codex by hand, losing the session's context and the freshly-created issue numbers. `-toco` closes that gap: it opens a **new tmux window** in the current session running `codex` at the repo root, stages the implementation command in its composer, and focuses the window.

It **replaces** local implementation rather than adding to it — nothing is implemented in the Claude session, so there is no double-implementation risk.

**Terminal-only.** Web has neither tmux nor a local Codex; the flag is inert there and the skill implements normally.

## Where the hand-off fires — the one real difference between callers

| Caller | Fires | Why |
| --- | --- | --- |
| `/x-as-pr`, `/x-wt-teams` | **At the start**, before any branch, PR, or worktree is created | There is no artifact to produce — the whole job goes to Codex, and a local branch would be stray |
| `/big-plan` (via `/tocodex`) | **At the end** (Step 11, in place of the auto-invoke) | Planning produces the epic + sub-issues Codex needs, so it must finish first |

Getting this wrong is the failure mode to avoid: an implementation skill that creates its branch first and *then* hands off leaves a dead branch and a confusing half-started PR behind.

## What gets sent

A Codex skill invocation, built from the caller and what it was given:

```
$x-wt-teams -m -a 445                    # epic / multi-topic
$x-as-pr -m -a 448                       # single issue
$x-as-pr add pagination to the user list # free text, no issue
```

Rules:

- **Route to the Codex skill matching the caller** — `/x-as-pr` and `/x-wt-teams` each send their own counterpart.
- **Forward `-a` / `-m` / `-nf` / `-nori` / `-lo`** if they were passed. Do **not** forward reviewer flags (`-co`, `-op`, `-nor`) or effort levels — those are the Codex session's own choice, the same rule the in-session hand-off follows.
- **Prefer a bare issue number** over a URL; Codex resolves it against the repo it was launched in.
- **No issue?** Send the instruction text itself. With `--make-issue`, create the issue first and send its number — the issue is the better spec and survives the session.
- **Local mode (`-lo`)** — forward `-lo` and send the plan **path** instead of an issue number (`{LOCAL_DIR}`, or `{LOCAL_DIR}/sub-01-<slug>.md` for a single topic).

### The `$` prefix is load-bearing — do not "fix" it to a slash

Codex has no `prompts/` directory and therefore no custom slash commands; its skills fire on `$name`. A leading `/foo` is claimed by the user's Codex `ccref` skill, which reads it as "go read the **Claude** skill `foo`" — so `/x-wt-teams` would pull in the Claude source instead of firing the Codex-native port at `$HOME/.codex/skills/x-wt-teams/`.

## Running it

```bash
bash "$HOME/.claude/scripts/handoff-to-codex.sh" \
  --dir "$(git rev-parse --show-toplevel)" \
  --name "codex-{issue# or slug}" \
  --command '$x-wt-teams -m -a 445' \
  --submit          # only when -a was passed
```

The script opens the window, waits for Codex's composer, types the command, and focuses the window. It handles what silently breaks a naive `send-keys`:

| Exit | Cause |
| --- | --- |
| 2 / 3 | Not inside tmux / no `codex` on PATH |
| 4 | A startup prompt (trust / update) is up and was **not** auto-answered — `--no-auto-answer`, or an update prompt with no recognisable "No" option |
| 5 | Timed out waiting for the composer |
| 6 | `tmux new-window` failed — an empty pane id would otherwise resolve to the **current** pane and type into the user's own Claude session |
| 7 | `codex` exited at startup, so the window closed |
| 8 | The command was typed but Codex did not start on it after three Enter presses — the draft is left in the composer for the user to submit |
| 64 | Usage error — a missing or unknown argument. A caller bug, not a user-fixable state; no fallback command is printed |

Codex needs ~10-14s before it accepts input, so the script polls for the composer rather than sleeping blind. It also collapses whitespace in the command to one line — free text forwarded from `/x-as-pr -toco` can contain newlines, and one deterministic line is easier to read back. (A literal newline sent this way is taken as a line break, not a submit — verified — so this is tidiness, not a fix for early submission.)

### Startup prompts are answered for you

Two Codex prompts can sit in front of the composer, and anything typed while one is up goes into the prompt, not the composer. The script answers each once, then keeps waiting for the composer:

| Prompt | Answer | Why |
| --- | --- | --- |
| `Do you trust the contents of this directory?` | **Yes, continue** | Project-local config, hooks, and exec policies must load for the skill to run |
| An update offer — a numbered menu, or a `[y/N]` line, mentioning "update" | **No** | Updating mid-hand-off is never what the user asked for; they upgrade Codex on their own schedule |

It prints what it answered (`Answered Codex's directory-trust prompt: Yes, continue` / `Declined Codex's update prompt: …`) — repeat that line in the hand-off report. `--no-auto-answer` restores the old behaviour of stopping at either prompt with exit 4; exit 4 also fires when an update menu has no option the script recognises as "No" (`no`, `not now`, `skip`, `later`, `never`, `dismiss`), so the user can decline it by hand. Codex renders inline, so an answered menu stays visible in the pane above the live composer — that is expected, not a sign the answer was lost.

Every exit except 64 prints the command for the user to send by hand (64 means the skill built the invocation wrong — fix the call, do not hand the user a fallback). Surface whatever it prints — a failed hand-off still leaves the work planned, just not started.

## Submit only under `-a`

With `-a` the user opted into autonomy: send Enter and let the run start. The script waits a moment before that Enter and then checks that Codex took the draft, pressing Enter again if not — Codex's composer treats a burst of keystrokes as a paste, and an Enter inside the burst becomes a line break (the command on one line, the cursor on an empty second line, nothing running). If you see that state after a hand-off, one more Enter in the window submits it; the script now does that itself. Without it, leave the command staged in the composer for them to read and submit. `-m` on its own merges without ever pausing, which is not something to start on someone's behalf.

## After handing off

The Claude session is done — Codex owns the work now.

- Run `node "$HOME/.claude/scripts/orientation.js" complete`. Do **not** leave the pointer active for the Codex session to "adopt"; it cannot.
- Do not create a branch, PR, tracking issue, or worktree for work that is now Codex's.
- Do not run the cleanup audit for resources that were never created.
- Report the window name, the exact command sent, and whether it was submitted or is waiting on Enter.

## Interactions

- **`-s` / `--stay` is meaningless with `-toco`** — the Codex session picks its own branch. Ignore it and say so.
- **`/big-plan`'s own `-toco` rules** (`-po` overrides it, it triggers the chain like `-a` / `-m`, and the three pause conditions gate it) live in `/big-plan`'s Step 11, since that path runs through `/tocodex` rather than this one.
