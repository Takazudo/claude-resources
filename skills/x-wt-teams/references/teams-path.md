# Teams Path — On-Demand Team Workflow

The **teams** path is the escape hatch for sessions where at least one topic needs mid-flight inter-agent coordination. It is **not** the steady-state default — the inline Step 5 / Step 7 in `SKILL.md` describe the common **subagents** path. Read this file **only** when the spawn path resolves to `teams` (any topic marked `teams`, or any topic missing the `Execution mode:` marker — see `references/execution-modes.md` for the routing decision).

This is the one capability with no Workflow-tool / one-shot-subagent equivalent (peers messaging each other mid-task), so it is preserved as a cheap escape hatch — never delete it.

## Step 5 — Teams-path spawn

This replaces the inline subagents-path spawn in `SKILL.md` Step 5. The **prompt body (items a–k)** is identical to the canonical one inlined in `SKILL.md` Step 5 — reuse it verbatim, with these team-specific differences:

- Item (i) applies UNCHANGED: the schema-conforming completion report goes to the manager via
  SendMessage. Both paths now use the same channel, so this is no longer a teams-path difference —
  the subagents path also requires SendMessage, because a returned plain-text final message never
  reaches the manager there (see `SKILL.md` Step 5 item (i) for the field evidence).
- Item (k) (foreground self-review — never background the review and wait on a notification) applies
  unchanged; it is what item (i)'s report certifies actually happened.
- The genuine teams-path difference is PEER messaging: a team agent may SendMessage its peers as well
  as the manager, and participates in the shutdown_request ceremony. A subagents-path child has no
  peers and no ceremony — it uses SendMessage only for its manager-facing report and blockers.

Use TeamCreate to create a team, then the Task tool to spawn child agents — one per topic. Each agent works in its own worktree directory.

```
1. TeamCreate with team_name: "<project-name>"
2. TaskCreate for each topic (implementation tasks)
3. Task tool to spawn agents with:
   - subagent_type: "general-purpose" — the standing child rules live in references/child-brief.md; the prompt must open by telling the child to read $HOME/.claude/skills/x-wt-teams/references/child-brief.md first
   - team_name: "<project-name>"
   - name: "topic-<name>"  (e.g., "topic-topicA")
   - (Do NOT pass a `mode:` param. Agent-team teammates inherit the lead's permission mode at spawn
     time; per-teammate modes cannot be set. Hook mechanics for auto-approving Edit/Write/NotebookEdit
     under worktrees/<topic>/ — see `SKILL.md` Step 5 "Subagents path".)
   - model: the per-topic resolved model — see "Resolve model per topic" in SKILL.md Step 5. Always set explicitly per child; different children in the same session may run different models.
   - prompt: the canonical prompt body (items a–k) from SKILL.md Step 5, with the team-specific
     differences noted above (item (i) is unchanged — SendMessage on both paths; the team-specific
     part is that this child IS on a team and may also message peers).
```

**Spawn child agents in parallel — capped at 6 concurrent.** Use multiple Task tool calls in a single message for the first batch. The **post-spawn "Each agent should" checklist (items 1–7)** is identical to the canonical one in `SKILL.md` Step 5 — reuse it verbatim, with this team-specific reading: spawning happens via Task tool calls, not one-shot Agent calls. Item 7's completion report goes via SendMessage on both paths, so it is no longer a teams-path difference. The report schema itself (foreground self-review confirmation + findings applied, final commit SHA, clean working tree confirmation, log file path) is unchanged, and a report missing any element — or one that says the agent is waiting/parked — still forbids merging or pruning that topic's worktree: see `SKILL.md` Step 6's merge gate and "Parked-child protocol."

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
