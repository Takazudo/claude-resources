# Codex Handoff (`-toco` / `--to-codex`) — implement on Codex CLI instead of here

Shared spec for `-toco` in `/x-wt-teams` and `/x-as-pr`. Both link here by absolute path (`$HOME/.claude/skills/x-wt-teams/references/codex-handoff.md`) instead of duplicating it. `/x` only parses and forwards the flag.

> **Read [`handoff-common.md`](handoff-common.md) before acting on this file.** It carries the rules both hand-off modes share — where the hand-off fires per caller, which flags travel, the recursion and mutual-exclusion guards, what happens on web, and what to do (and not do) afterwards. This file covers only what is specific to targeting Codex. Load it; a link is not a substitute for having read it.

**`/big-plan -toco` no longer uses this path — it delegates to the `/tocodex` skill.** Its hand-off fires at the *end* of a session that produced an epic, which makes it the same job the user does by hand after a `-po` plan; `/tocodex` is that job as a standalone skill. The two implementation skills keep their hand-off here because theirs fires at the *start*, before a branch exists, and routing it through another skill would only add a hop. Two consequences: `/tocodex` **submits by default** (the user asked for the hand-off) where this path submits only under `-a`, and `/tocodex` accepts free-text prompts, which this path never needs to.

## Why this mode exists

The user plans on Claude Code and implements on Codex CLI. Without `-toco` that means closing the Claude session and starting Codex by hand, losing the session's context and the freshly-created issue numbers. `-toco` closes that gap: it opens a **new tmux window** in the current session running `codex` at the repo root, stages the implementation command in its composer, and focuses the window.

**The sibling flag is `-tocl` / `--to-claude`** ([`claude-handoff.md`](claude-handoff.md)), which hands the same job to a fresh **Claude Code** session instead. Reach for that one when the point is a clean context rather than a different tool; the two are mutually exclusive.

## What gets sent

A Codex skill invocation, built from the caller and what it was given:

```
$x-wt-teams -m -a 445                    # epic / multi-topic
$x-as-pr -m -a 448                       # single issue
$x-as-pr add pagination to the user list # free text, no issue
```

Route to the Codex skill matching the caller — `/x-as-pr` and `/x-wt-teams` each send their own counterpart. Which flags travel, issue-vs-prose, `--make-issue`, `-lo`, and the long-prompt-to-a-file rule are all in [`handoff-common.md`](handoff-common.md).

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

The script opens the window as `codex -m gpt-6-sol -c model_reasoning_effort="medium"`, waits for Codex's composer, types the command, and focuses the window. It handles what silently breaks a naive `send-keys`:

| Exit | Cause |
| --- | --- |
| 2 / 3 | Not inside tmux / no `codex` on PATH |
| 4 | A startup prompt (trust / update) is up and was **not** auto-answered — `--no-auto-answer`, or an update prompt with no recognisable "No" option |
| 5 | Timed out waiting for the composer |
| 6 | `tmux new-window` failed — an empty pane id would otherwise resolve to the **current** pane and type into the user's own Claude session |
| 7 | `codex` exited at startup, so the window closed |
| 8 | The command was typed but Codex did not start on it after three Enter presses — the draft is left in the composer for the user to submit |
| 64 | Usage error — a missing, unknown, or invalid argument. A caller bug, not a user-fixable state; no fallback command is printed |

Codex needs ~10-14s before it accepts input, so the script polls for the composer rather than sleeping blind. It also collapses whitespace in the command to one line — free text forwarded from `/x-as-pr -toco` can contain newlines, and one deterministic line is easier to read back. (A literal newline sent this way is taken as a line break, not a submit — verified — so this is tidiness, not a fix for early submission.)

### The Codex session starts on Sol at medium effort

The launch pins `-m gpt-6-sol` and `-c model_reasoning_effort="medium"` for every caller of this script — `/tocodex`, `/big-plan -toco`, and both implementation skills' own `-toco`. A hand-off fires *after* the plan exists: the Codex session is executing a spec that has already been argued out, which is a manager's job — dispatch the topics, keep the run moving — not a reasoning-heavy one. That is the manager tier; workers are dispatched from there by difficulty — `high` → `gpt-6-astra`/high, `mid` → `gpt-6-sol`/medium, `standard` → `gpt-6-luna`/max. The receiving session can raise its own with `/model`.

This is the one place the two hand-offs differ in spirit. `-tocl` pins Opus as a *floor* because a fresh Claude session inherits nothing and cannot know what the work needs ([`claude-handoff.md`](claude-handoff.md)); `-toco` pins the manager tier as a *ceiling* because by then the thinking is done and written down, and what reasoning remains is pushed down into the Astra workers.

`--model <name>` and `--effort <level>` pin something else, and either as `inherit` sends no flag so `~/.codex/config.toml` decides — the escape hatch for an account where the pinned model is unavailable, which would otherwise kill startup (exit 7). No skill exposes a flag for this; they are script arguments. The script prints what it pinned — repeat that line in the hand-off report.

### Startup prompts are answered for you

Two Codex prompts can sit in front of the composer, and anything typed while one is up goes into the prompt, not the composer. The script answers each once, then keeps waiting for the composer:

| Prompt | Answer | Why |
| --- | --- | --- |
| `Do you trust the contents of this directory?` | **Yes, continue** | Project-local config, hooks, and exec policies must load for the skill to run |
| An update offer — a numbered menu, or a `[y/N]` line, mentioning "update" | **No** | Updating mid-hand-off is never what the user asked for; they upgrade Codex on their own schedule |

It prints what it answered (`Answered Codex's directory-trust prompt: Yes, continue` / `Declined Codex's update prompt: …`) — repeat that line in the hand-off report. `--no-auto-answer` restores the old behaviour of stopping at either prompt with exit 4; exit 4 also fires when an update menu has no option the script recognises as "No" (`no`, `not now`, `skip`, `later`, `never`, `dismiss`), so the user can decline it by hand. Codex renders inline, so an answered menu stays visible in the pane above the live composer — that is expected, not a sign the answer was lost.

Every nonzero exit except 64 prints the command for the user to send by hand (64 means the skill built the invocation wrong — fix the call, do not hand the user a fallback). Surface whatever it prints — a failed hand-off still leaves the work planned, just not started.

## Submit only under `-a`

With `-a` the user opted into autonomy: send Enter and let the run start. The script waits a moment before that Enter and then checks that Codex took the draft, pressing Enter again if not — Codex's composer treats a burst of keystrokes as a paste, and an Enter inside the burst becomes a line break (the command on one line, the cursor on an empty second line, nothing running). If you see that state after a hand-off, one more Enter in the window submits it; the script now does that itself. Without it, leave the command staged in the composer for them to read and submit. `-m` on its own merges without ever pausing, which is not something to start on someone's behalf.

## After handing off

The Claude session is done — Codex owns the work now. The full checklist (close the orientation pointer, create nothing, skip the cleanup audit, what to report) is in [`handoff-common.md`](handoff-common.md).

## Interactions

- **`-s` / `--stay` is meaningless with `-toco`** — the Codex session picks its own branch. Ignore it and say so.
- **`-toco` and `-tocl` are mutually exclusive** — see [`handoff-common.md`](handoff-common.md). Name the collision and stop.
- **`/big-plan`'s own `-toco` rules** (`-po` overrides it, it triggers the chain like `-a` / `-m`, and the three pause conditions gate it) live in `/big-plan`'s Step 11, since that path runs through `/tocodex` rather than this one.
