# Teams Path — On-Demand Team Workflow

The **teams** path is the escape hatch for sessions where at least one topic needs mid-flight inter-agent coordination. It is **not** the steady-state default — the inline Step 5 / Step 7 in `SKILL.md` describe the common **subagents** path. Read this file **only** when the spawn path resolves to `teams` (any topic marked `teams`, or any topic missing the `Execution mode:` marker — see `references/execution-modes.md` for the routing decision).

This is the one capability with no Workflow-tool / one-shot-subagent equivalent (peers messaging each other mid-task), so it is preserved as a cheap escape hatch — never delete it.

## Step 5 — Teams-path spawn

This replaces the inline subagents-path spawn in `SKILL.md` Step 5. The **prompt body (items a–k)** is identical to the canonical one inlined in `SKILL.md` Step 5 — reuse it verbatim, with these team-specific differences:

- Item (i) becomes: report the schema-conforming completion report via SendMessage when done, instead
  of returning a plain-text report. The schema itself (foreground self-review confirmation + findings
  applied, final commit SHA, clean working tree confirmation, log file path) is unchanged — see
  `SKILL.md` Step 6's merge gate.
- Item (k) (foreground self-review — never background the review and wait on a notification) applies
  unchanged; it is what item (i)'s report certifies actually happened.
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
   - prompt: the canonical prompt body (items a–k) from SKILL.md Step 5, with the team-specific
     differences noted above (item (i) becomes report-via-SendMessage; the child IS on a team and
     may message peers / the manager).
```

**Spawn child agents in parallel — capped at 6 concurrent.** Use multiple Task tool calls in a single message for the first batch. Each agent should:

1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (deferred to Step 11)
4. **Run `/light-review`** to self-review — fix clearly useful findings and commit. Forward whichever reviewer flags were on the original invocation (`-op` / `-so` / `-haiku` / `-co`). If no reviewer flag is active, `/light-review` falls to its own default (`-co`). **Run this in the foreground.** Do NOT start a background review and then wait for a completion notification — background-task notifications go to the manager, not to the child. Apply findings, COMMIT, then report (item k).
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back via SendMessage using the completion-report schema** (see `SKILL.md` Step 6's merge
   gate) — not a brief status line. The report must contain: (1) confirmation self-review ran in the
   foreground and findings were applied (or "none found"), (2) final commit SHA, (3) confirmation the
   working tree is clean, (4) log file path — plus a PR URL if created. A report missing any of these,
   or one that says the agent is waiting/parked, is not a completion report; the manager will not merge
   or prune that topic's worktree on it — see `SKILL.md` Step 6's "Parked-child protocol."

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
