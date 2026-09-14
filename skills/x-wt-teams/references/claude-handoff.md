# Claude Handoff (`-tocl` / `--to-claude`) — implement in a fresh Claude Code session

Shared spec for `-tocl` in `/x-wt-teams` and `/x-as-pr`. Both link here by absolute path (`$HOME/.claude/skills/x-wt-teams/references/claude-handoff.md`) instead of duplicating it. `/x` only parses and forwards the flag.

> **Read [`handoff-common.md`](handoff-common.md) before acting on this file.** It carries the rules both hand-off modes share — where the hand-off fires per caller, which flags travel, the recursion and mutual-exclusion guards, what happens on web, and what to do (and not do) afterwards. This file covers only what is specific to targeting Claude Code. Load it; a link is not a substitute for having read it.

**`/big-plan -tocl` does not use this path — it delegates to the `/toclaude` skill.** Its hand-off fires at the *end* of a session that produced an epic, which makes it the same job the user does by hand after a `-po` plan; `/toclaude` is that job as a standalone skill. The two implementation skills keep their hand-off here because theirs fires at the *start*, before a branch exists, and routing it through another skill would only add a hop. Two consequences: `/toclaude` **submits by default** (the user asked for the hand-off) where this path submits only under `-a`, and `/toclaude` accepts free-text prompts, which this path never needs to.

## Why this mode exists

**A fresh context.** After a long planning session, the implementation should not inherit the planner's context window — it should start clean, the way `/clear` starts clean. But `/clear` is a user-side command: an agent cannot invoke it on its own session. A brand-new `claude` process in a new tmux window is the only way to get that state, and this flag turns the manual version of it — close the session, open a terminal, `cd`, launch, retype the issue numbers from memory — into one flag that carries the numbers across.

That is the whole difference from `-toco`. `-toco` exists because the user implements on a *different tool*; `-tocl` exists because the user implements on the *same tool with a clean slate*. Both replace local work rather than adding to it.

## What gets sent

An ordinary Claude Code slash command, built from the caller and what it was given:

```
/x-wt-teams -m -a 445                    # epic / multi-topic
/x-as-pr -m -a 448                       # single issue
/x-as-pr add pagination to the user list # free text, no issue
```

Route to the skill matching the caller — `/x-as-pr` and `/x-wt-teams` each send their own counterpart. Issue-vs-prose, `--make-issue`, `-lo`, and the long-prompt-to-a-file rule are all in [`handoff-common.md`](handoff-common.md).

### No `$` prefix, no port check — this is not the Codex path

The Codex hand-off has to send `$x-wt-teams` because Codex has no custom slash commands and a leading `/` is claimed by the user's Codex `ccref` skill, and it has to check `$HOME/.codex/skills/<name>/SKILL.md` first because the Codex port may not exist. **Neither applies here.** The target *is* Claude Code, `/x-wt-teams` is the real skill, and there is nothing to verify. If you find yourself writing a `$` or an `ls ~/.codex/...`, you have copied from the wrong file.

## The mechanism: the prompt is an argv, not a keystroke

`claude` takes the prompt as a positional argument (`claude [options] [prompt]`) and starts on it once the session is up — a slash command passed that way expands and fires exactly as if typed. The CLI owns the prompt from the moment the process starts.

That is why this script is a fraction of the size of `handoff-to-codex.sh`. Codex has to be typed into: its composer has to be polled for, a keystroke burst gets read as a paste, and the Enter inside that burst becomes a line break instead of a submit. None of that exists here. Do not port those defences over — they would be guarding against nothing.

**Cross-session messaging is not the better tool here, and this is settled.** Claude Code can message other local sessions (`ListAgents` / `SendMessage`), so "launch bare, then message it" looks tempting. It is worse: the new session has to come up and register before it is addressable, which is a race the argv path simply does not have, and it buys nothing — a hand-off is one-shot, not a conversation. Use argv.

## Running it

```bash
bash "$HOME/.claude/scripts/handoff-to-claude.sh" \
  --dir "$(git rev-parse --show-toplevel)" \
  --name "claude-{issue# or slug}" \
  --command '/x-wt-teams -m -a 445' \
  --submit          # only when -a was passed
```

The script opens the window with `CLAUDE_CODE_NO_FLICKER=1`, `--dangerously-skip-permissions` and `--model opus`, waits for the session to come up, and focuses the window. It passes the command to tmux as its own argument rather than building a shell string, so quotes, `$(…)` and backticks in a free-text prompt reach the new session literally.

### The new session starts on Opus

The launch pins `--model opus` for every caller of this script — `/toclaude`, `/big-plan -tocl`, and both implementation skills' own `-tocl`. A hand-off exists to start *implementation* on a clean context window, and inheriting whatever model the launching session happened to be dialled down to is not part of a clean start; the new process cannot know what the work needs, so Opus is the deliberate floor. The receiving session can still `/model` its way elsewhere.

`--model <alias>` on the script pins something else, and `--model inherit` sends no `--model` at all so the new session takes its configured default — the escape hatch for an account where the pinned model is unavailable, which would otherwise kill startup (exit 7). No skill exposes a flag for this; it is a script argument. The script prints the model it pinned — repeat that line in the hand-off report.

| Exit | Cause |
| --- | --- |
| 2 / 3 | Not inside tmux / no `claude` on PATH |
| 4 | The directory-trust prompt is up and was **not** auto-answered — `--no-auto-answer`, or its affirmative option was not recognised |
| 5 | Timed out waiting for the session to come up |
| 6 | `tmux new-window` failed or returned no usable pane id — an empty pane id would otherwise resolve to the **current** pane and type into the user's own Claude session |
| 7 | `claude` exited at startup, so the window closed (or the pane is dead) |
| 8 | The session came up but the command did not land — the argv prompt never started (`--submit`), or the composer keystrokes failed (staged) |
| 64 | Usage error — a missing, unknown, or invalid argument. A caller bug, not a user-fixable state; no fallback command is printed |

**When the command went in as argv (`--submit`, i.e. under `-a`), exit 5 or 8 does not mean it did not run.** Unlike a composer draft, an argv prompt may simply be queued behind a startup prompt — so do not resend on the user's behalf, and do not declare it dead. Without `--submit` the same codes mean the keystrokes never landed and the command does have to be sent by hand. The script's message already says which case it is; surface it verbatim rather than paraphrasing.

### The directory-trust prompt

Claude Code asks `Is this a project you created or one you trust?` the first time it runs in a directory — **even under `--dangerously-skip-permissions`**, and with **"No, exit" preselected**. Left unanswered it swallows the hand-off silently.

In the normal case it never appears: the hand-off launches at the current repo root, which the session running the script is already trusted in. It can appear for a worktree or a sibling repo. The script answers it by locating the affirmative option and moving to it — never by pressing Enter on whatever is selected, which would take the preselected *exit*. If it cannot identify that option it stops at exit 4 rather than guessing. It prints what it answered; repeat that line in the hand-off report.

## Submit only under `-a`

With `-a` the user opted into autonomy: pass `--submit` and let the run start. Without it, the script types the command into the composer and leaves it unsent for the user to read and press Enter on. `-m` on its own merges without ever pausing, which is not something to start on someone's behalf.

(`/toclaude` inverts this default — see the note at the top.)

## Interactions

- **`-s` / `--stay` is meaningless with `-tocl`** — the new session picks its own branch. Ignore it and say so.
- **`-tocl` and `-toco` are mutually exclusive** — see [`handoff-common.md`](handoff-common.md). Name the collision and stop.
- **`/big-plan`'s own `-tocl` rules** (`-po` overrides it, it triggers the chain like `-a` / `-m`, and the hard-autonomy stops gate it) live in `/big-plan`'s Step 11, since that path runs through `/toclaude` rather than this one.
- **This is not `/clear` for the current session.** Nothing here resets the session that runs it; it ends the current session's involvement and starts a different one. If the user wanted to keep working here, they did not want this flag.
