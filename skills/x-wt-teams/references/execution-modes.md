# Execution Modes — Subagents vs Teams

How `/x-wt-teams` decides whether to spawn each child as a one-shot **subagent** (via the Agent tool) or as a **team teammate** (via TeamCreate + the Agent tool with `team_name`). Read this whenever Step 5 is about to spawn children.

## TL;DR

- **Default = teams.** Existing behavior. If no `Execution mode:` marker is found anywhere, run the full team workflow exactly as Step 5 has always done.
- **All topics marked `subagents` = subagents path.** No team is created. Each topic runs as a one-shot Agent call with `subagent_type: "frontend-worktree-child"` (or `general-purpose` for non-frontend), pointing at the pre-created worktree. No TeamCreate, no shutdown ceremony, no SendMessage.
- **Mixed (any topic marked `teams`) = teams path for the whole session.** Simpler than mixing the two spawn mechanisms and matches how peers expect to message each other. The subagent-marked topics still benefit from the team's shared task list, just without subagent savings.

## Why two paths exist

`/big-plan` annotates each sub-task with an `Execution mode:` line that says either `subagents` or `teams` plus a one-line reason. The classification is made at planning time because that's where the dependency context lives — `/x-wt-teams` at invocation only sees a plan summary and can't reliably re-derive whether topic B needs topic A's output mid-flight.

The criterion is **mid-flight inter-agent communication**, NOT task weight:

- A heavy refactor with no peer comms → `subagents`. Same model, same work.
- A small task that pings a sibling for a partial output mid-task → `teams`. Needs the shared task list and SendMessage.

Default is `subagents` because most fan-out/return work doesn't need comms. Teams is the safety choice when comms are actually required.

## Reading the marker

The marker spelling is exact — grep for these strings:

**Non-Super-Epic mode** (each topic is its own `[Sub]` issue):

```
gh issue view <sub-issue-number> | grep -E '^\*\*Execution mode:\*\* '
```

Expected line in the body (immediately after the `---` divider):

```
**Execution mode:** subagents — independent, no inter-topic communication
```

or

```
**Execution mode:** teams — depends on topicA's schema output mid-flight
```

**Super-Epic child mode** (sub-tasks are inline bullets in the epic body):

The marker appears as a sub-bullet under each sub-task entry:

```markdown
- **Header nav component** — adds the top nav with auth dropdown
  - **Execution mode:** subagents — independent, no inter-topic communication
- **Top hero card** — landing card with CTA
  - **Execution mode:** teams — peers with hero-data topic mid-task
```

Parse both forms case-sensitively. Treat any other value (`agents`, `agent`, blank reason, missing line) as **missing** — fall back to teams.

## Routing decision

```
modes = [extract_execution_mode(topic) for topic in topics]

if any(m is None for m in modes):
    # at least one topic has no marker — fall back to teams (current behavior)
    spawn_path = "teams"
elif all(m == "subagents" for m in modes):
    spawn_path = "subagents"
else:
    # any "teams" or mixed → teams
    spawn_path = "teams"
```

Tell the user which path was chosen at the start of Step 5, with one line explaining why:

> Execution mode: subagents (all topics marked subagents in big-plan annotations).

or

> Execution mode: teams (topic-A marked `teams`: depends on topic-B's API output mid-flight).

or

> Execution mode: teams (no `Execution mode` annotations found — defaulting to teams).

## Drift sanity check (before spawning)

Recommendations from `/big-plan` were made against the topic scope **as written at planning time**. If the topic body has been edited substantially since, the recommendation may be stale.

Cheap heuristic — for each topic, before spawning:

1. Fetch the issue's `updatedAt` and the current time. If updated recently AND the body now obviously implies coordination the marker doesn't reflect (e.g. the topic now says "wait for topic-X to finish schema first" but is marked `subagents`), surface a one-line warning:

   > Topic "<name>" was edited after planning and now appears to require teams (mentions waiting on another topic), but is marked `subagents`. Override to teams? (yes/no)

2. If the user confirms, switch the whole session to teams. If the user says no or the heuristic doesn't fire, proceed with the marker.

This is **advisory, not blocking**. Don't pause for confirmation when no drift signal is detected — just proceed. The check exists to catch the edge case where a topic was rewritten after `/big-plan`'s annotation; the common case is no edit and the marker is correct.

## Subagents path — Step 5 replacement

When `spawn_path == "subagents"`, replace the Step 5 TeamCreate + team-member spawn flow with parallel Agent tool calls:

1. **No TeamCreate. No TaskCreate.** Skip both.
2. For each topic, issue an Agent tool call in the **same message** (parallel) — capped at 6 concurrent (same rule as the teams path):

   ```
   Agent({
     description: "Implement <topic-name>",
     subagent_type: "frontend-worktree-child",   // or "general-purpose" for non-frontend
     model: <resolved model from -haiku/-so/-op flag, default opus>,
     prompt: <same prompt body the teams path would use, with these adjustments:
              - tell the agent its working directory is the absolute path of worktrees/<topic>/
              - tell it to commit locally only (no push)
              - tell it to run /light-review and apply useful findings (forwarding any -co/-gco/-gcoc backend flag)
              - tell it to NOT use SendMessage (no team in this session)
              - tell it to return a brief plain-text summary: status, log file path
              - all other rules (no browser tools, no heavy/port-based tests, rebuild touched workspace packages) apply unchanged>
   })
   ```

3. **Do NOT pass `isolation: "worktree"`** — the worktree was already created in Step 3. The agent works in the existing worktree directory; it does not create its own.
4. **No `team_name`, no `name`** — these are team-only parameters.
5. With 7+ topics, spawn the first 6 in parallel and queue the rest. As each Agent call returns, spawn the next queued topic. Same rule as the teams path.

## Step 7 cleanup — subagents path

When `spawn_path == "subagents"`, Step 7 simplifies:

1. **Skip the SendMessage shutdown_request loop.** No team exists.
2. **Skip TeamDelete.** No team exists.
3. **Worktree removal still runs.** Same as the teams path.
4. **pnpm symlink fix still runs** if the project uses pnpm workspaces.

The rest of the workflow (Step 6 merge, Step 8 sync, Step 9 review, Step 10 verify-ui, Step 11 push, Step 12 CI watch, Steps 13–15) is identical regardless of path.

## What about /light-review inside subagents?

Works the same way as in the teams path. `/light-review`'s default route (`/gcoc-review`) shells out to the GitHub Copilot CLI via Bash — it does not spawn nested Agent calls. Subagents have Skill and Bash access (the `frontend-worktree-child` agent has "All tools"), so the call succeeds inside a subagent.

If `/light-review` escalates to a Claude-based path that spawns nested subagents, those nested calls also work because the parent subagent has Agent in its toolset. There is no two-level nesting limit.

## Mixed-mode degradation rationale

When the markers say "topic A: subagents, topic B: teams," in principle topic A could run as a subagent and topic B as a team teammate. The skill deliberately does NOT do this:

- It would require maintaining two parallel spawn paths in the same session, with two cleanup paths.
- A team teammate cannot SendMessage to a non-team subagent, so if topic B's `teams` rationale was "peers with topic A," the assumption breaks anyway.
- Falling back to teams for the whole session is a safe superset — topics that would have worked as subagents still work as team teammates, just with the usual coordination overhead.

When this turns out to be too coarse in practice (e.g. one specialty `teams` topic forces an otherwise-clean subagents session into team mode), the fix is to re-plan with `/big-plan` and challenge that one topic — not to add mixed-mode support.
