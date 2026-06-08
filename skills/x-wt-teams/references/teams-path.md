# Teams Path — On-Demand Team Workflow

The **teams** path is the escape hatch for sessions where at least one topic needs mid-flight inter-agent coordination. It is **not** the steady-state default — the inline Step 5 / Step 7 in `SKILL.md` describe the common **subagents** path. Read this file **only** when the spawn path resolves to `teams` (any topic marked `teams`, or any topic missing the `Execution mode:` marker — see `references/execution-modes.md` for the routing decision).

This is the one capability with no Workflow-tool / one-shot-subagent equivalent (peers messaging each other mid-task), so it is preserved as a cheap escape hatch — never delete it.

## SendMessage Content — No Markdown Code Spans (Ink Crash Workaround)

**HARD RULE**: Every `SendMessage` tool call — manager → child, child → manager, or peer → peer — MUST use plain prose in the `message` content. No backticks, no triple-backtick code fences, no inline markdown code formatting of any kind. Reference file paths, function names, shell commands, and identifiers as unquoted words.

**Why**: Claude Code v2.1.117 has an unfixed Ink rendering bug ([anthropics/claude-code#51855](https://github.com/anthropics/claude-code/issues/51855)). When a teammate's message contains inline code spans, Claude Code's `※ recap:` summary line crashes with `<Box> can't be nested inside <Text>` at `createInstance` (`cli.js:495:249`). The crashed pane then tears down the whole `$HOME/.claude/teams/<name>/` directory, cascading to all other teammates. In a 6-way parallel workflow, one stray backtick in one message can kill the entire run. Receive-side stalls have also been observed, so the rule applies in both directions.

**Examples:**

- Bad: "Committed the fix to `src/api.ts` — run `pnpm test` to verify"
- Good: "Committed the fix to src/api.ts — run pnpm test to verify"
- Bad: triple-backtick fenced diff or code block inside the message
- Good: "See the log file at {logdir}/… for the diff"

**Scope**: Applies ONLY to `SendMessage` tool calls. Markdown (including backticks and code fences) is still fine everywhere else — commits, PR bodies, issue comments, log files, TaskCreate descriptions, source code. When the upstream bug is fixed, revisit and drop this workaround.

## Step 5 — Teams-path spawn

This replaces the inline subagents-path spawn in `SKILL.md` Step 5. The **prompt body (items a–j)** is identical to the canonical one inlined in `SKILL.md` Step 5 — reuse it verbatim, with these team-specific differences:

- Item (i) becomes the active SendMessage rule: when reporting via SendMessage, message content must be plain prose (no backticks / code fences). See "SendMessage Content" above.
- The agent IS part of a team — it may SendMessage peers and the manager (the subagents path tells children NOT to use SendMessage; the teams path enables it).

Use TeamCreate to create a team, then the Task tool to spawn child agents — one per topic. Each agent works in its own worktree directory.

```
1. TeamCreate with team_name: "<project-name>"
2. TaskCreate for each topic (implementation tasks)
3. Task tool to spawn agents with:
   - subagent_type: "frontend-worktree-child" (or "general-purpose" for non-frontend topics)
   - team_name: "<project-name>"
   - name: "topic-<name>"  (e.g., "topic-topicA")
   - (Do NOT pass a `mode:` param. Agent-team teammates inherit the lead's permission mode at spawn
     time; per-teammate modes cannot be set. Permission prompts on file edits are handled by the
     PreToolUse hook at $HOME/.claude/hooks/allow-worktree-teammate-edits.sh, which auto-approves
     Edit/Write/NotebookEdit when either the session cwd or the target file path sits under a
     worktrees/<topic>/ segment. Confirm the hook is registered in settings.json before first use.)
   - model: the per-topic resolved model — see "Resolve model per topic" in SKILL.md Step 5. Always set explicitly per child; different children in the same session may run different models.
   - prompt: the canonical prompt body (items a–j) from SKILL.md Step 5, with the team-specific
     differences noted above (item (i) is the active SendMessage no-backticks rule; the child IS on
     a team and may message peers / the manager).
```

**Spawn child agents in parallel — capped at 6 concurrent.** Use multiple Task tool calls in a single message for the first batch. Each agent should:

1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (deferred to Step 11)
4. **Run `/light-review`** to self-review — fix clearly useful findings and commit. Forward whichever reviewer flags were on the original invocation (`-op` / `-so` / `-haiku` / `-co` / `-gco`). If no reviewer flag is active, `/light-review` falls to its own default (`-co`).
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back with brief message only**: status (1-2 sentences), PR URL if created, log file path. No backticks / code fences in SendMessage.

The Step 5 concurrency cap (max 6 child agents at once) applies identically to the teams path — see `SKILL.md` Step 5 "Concurrency Limit".

## Step 7 — Teams-path teardown

When the spawn path is `teams`, Step 7 runs the full team shutdown ceremony before worktree removal:

1. **Send shutdown to each agent individually** (structured messages cannot be broadcast to `"*"`):

   ```
   For each child agent (e.g., "topic-topicA", "topic-topicB", ...):
     SendMessage: to="topic-<name>", message={type: "shutdown_request", reason: "All topics merged into base branch. Work complete."}
   ```

   Send all shutdown messages in parallel (multiple SendMessage calls in one response).

2. **Wait for shutdown confirmations**, then **delete the team**:

   ```
   TeamDelete
   ```

3. **Remove worktrees** — same as the subagents path (`SKILL.md` Step 7).
4. **Fix pnpm symlinks** — same as the subagents path (`SKILL.md` Step 7).

This closes the tmux panes and frees disk space. The rest of the workflow (review, push, CI) is handled by the manager alone, identical to the subagents path.

## Feedback Loop note

The Feedback Loop in `SKILL.md` ("Iterating on User Feedback") uses an incremented team name (`<project-name>-v2`, `-v3`, …) when it re-runs the teams path for a feedback iteration. That naming rule only matters on the teams path; on the subagents path each iteration spawns fresh one-shot Agent calls with no team name.
