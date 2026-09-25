# Execution Modes — Subagents vs Teams

How `/x-wt-teams` decides whether to spawn each child as a one-shot **subagent** (via the Agent tool) or as a **team teammate** (via TeamCreate + the Agent tool with `team_name`). Read this whenever Step 5 is about to spawn children.

## TL;DR

Two axes that are easy to conflate — keep them separate:

- **Routing default = teams** (unchanged). The *routing fallback* when markers are missing is still teams: if no `Execution mode:` marker is found anywhere, run the teams path.
- **Disclosure default = subagents** (the common case). The **subagents path is now the inline default** in `SKILL.md` Step 5 / Step 7 — it owns the canonical prompt body. The teams path is on-demand in `references/teams-path.md`, read only when the routing resolves to teams. This keeps teams tokens off every invocation while preserving teams as the escape hatch.

Concretely:

- **All topics marked `subagents` = subagents path (inline default).** No team is created. Each topic runs as a one-shot Agent call with `subagent_type: "general-purpose"` (standing rules in `references/child-brief.md`), pointing at the pre-created worktree. No TeamCreate, no shutdown ceremony, no peer-to-peer messaging. Children DO still report to the manager via SendMessage — that is the only channel a completion report reaches him on (see `SKILL.md` Step 5 item (i)). This is exactly the inline `SKILL.md` Step 5 / Step 7 flow.
- **Any topic marked `teams`, OR any topic missing the marker = teams path for the whole session.** Read `references/teams-path.md` and run the full team workflow there. Simpler than mixing the two spawn mechanisms and matches how peers expect to message each other. The subagent-marked topics still benefit from the team's shared task list, just without subagent savings. The missing-marker fallback being teams preserves pre-annotation behavior.

## Why two paths exist

`/big-plan` annotates each sub-task with an `Execution mode:` line that says either `subagents` or `teams` plus a one-line reason. The classification is made at planning time because that's where the dependency context lives — `/x-wt-teams` at invocation only sees a plan summary and can't reliably re-derive whether topic B needs topic A's output mid-flight.

The criterion is **mid-flight inter-agent communication**, NOT task weight:

- A heavy refactor with no peer comms → `subagents`. Same model, same work.
- A small task that pings a sibling for a partial output mid-task → `teams`. Needs the shared task list and SendMessage.

Default is `subagents` because most fan-out/return work doesn't need comms. Teams is the safety choice when comms are actually required.

## Reading the marker

The marker spelling is exact — grep for these strings:

**Standard shape** (each topic is its own `[Sub]` issue — this includes Super-Epic child epics produced by a `/big-plan -is` sweep):

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

**Legacy inline shape** (a Super-Epic child epic with NO `[Sub]` issues — sub-tasks are inline bullets in the epic body; produced by the retired standalone Super-Epic producer):

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

## Subagents path — the inline Step 5 default (Agent-call shape)

`spawn_path == "subagents"` is the inline default in `SKILL.md` Step 5. This is the exact Agent-call shape for each topic (the canonical prompt body items a–k are in `SKILL.md` Step 5):

1. **No TeamCreate. No TaskCreate.** Skip both.
2. For each topic, issue an Agent tool call in the **same message** (parallel) — capped at 6 concurrent (same rule as the teams path; **on web: uncapped, fan out all topics at once — web-mode.md §6**):

   ```
   Agent({
     description: "Implement <topic-name>",
     subagent_type: "general-purpose",   // prompt opens with: read references/child-brief.md (absolute path)
     model: <resolved per-topic team-member model (see references/per-topic-models.md), default opus>,
     prompt: <the canonical prompt body (items a–k) from SKILL.md Step 5, with these adjustments:
              - tell the agent its working directory is the absolute path of worktrees/<topic>/
              - tell it to commit locally only (no push)
              - tell it to SELF-REVIEW BY READING ITS OWN DIFF (git diff <base>...HEAD)
                — NOT by invoking /code-review, /deep-review or
                /codex-review. From a plain subagent /code-review returns a background handle rather than
                findings, and TaskOutput is not in a subagent's toolset, so there is no way to drain it;
                a child that starts one and waits parks. Apply findings, COMMIT, then report (item k)
              - tell it to send the schema-conforming completion report (item i) VIA SendMessage to
                the manager: foreground self-review confirmation + findings applied, final commit SHA,
                clean working tree confirmation, log file path. Say the channel out loud — "return it
                via SendMessage; a plain-text return does not reach me; an issue comment is not a
                substitute". A returned plain-text final message never reaches the manager, and a
                child that ends its turn that way is indistinguishable from a parked one (field
                evidence in SKILL.md Step 5 item (i): six-for-six children parked this way in one run)
              - there is still no team here: no shutdown_request ceremony and no peers to message —
                SendMessage is for the manager-facing report and for raising blockers, nothing else
              - all other rules (no browser tools, no heavy/port-based tests, rebuild touched workspace packages) apply unchanged>
   })
   ```

3. **Do NOT pass `isolation: "worktree"`** — the worktree was already created in Step 3. The agent works in the existing worktree directory; it does not create its own.
4. **No `team_name`, no `name`** — these are team-only parameters.
5. With 7+ topics, spawn the first 6 in parallel and queue the rest. As each Agent call returns, spawn the next queued topic. Same rule as the teams path. **On web (web-mode.md §6): no cap — spawn all topics in one batch.**

## Step 7 cleanup — subagents path

On the subagents path (the inline default), Step 7 is the simple form already inline in `SKILL.md` Step 7:

1. **No SendMessage shutdown_request loop.** No team exists.
2. **No TeamDelete.** No team exists.
3. **Worktree removal still runs.** Same as the teams path.
4. **pnpm symlink fix still runs** if the project uses pnpm workspaces.

The teams path adds the shutdown ceremony before worktree removal — see `references/teams-path.md` "Step 7 — Teams-path teardown".

The rest of the workflow (Step 6 merge, Step 8 sync, Step 9 review, Step 10 verify-ui, Step 11 push, Step 12 CI watch, Steps 13–15) is identical regardless of path.

## What about the self-review inside subagents?

**The trap: starting the review and then waiting for it.** Any review a child starts out-of-band lands the same way — a `/codex-review` shell-out backgrounded via Bash, or a `/code-review` that returns an async handle because the built-in reviewer runs as a background subagent with its own context window. Subagents *can* reach these (children have all tools); reachability is not the problem. The problem is a child that ends its turn waiting on a completion notification, because that notification is delivered to the **manager**, not to the child. The child parks indefinitely — often with real work already committed but never reported. This is the documented cause behind two linked defects in issue #114: parked children, and a manager that (lacking any report) fell back to merging on worktree inspection alone.

The fix is `SKILL.md` Step 5 item (k) (mirrored above in this file's Agent-call shape): **the child reviews its own diff by hand** — read `git diff <base>...HEAD` — applies findings, COMMITs, then reports. Item (k) is a prompt-level override: the child follows this explicit orchestrator instruction over whatever a review skill's own default flow would do.

**Why a child does not invoke `/code-review`, when it is the default reviewer everywhere else.** `/code-review` is a `context: fork` skill that backgrounds by default, and there is no per-invocation way to force it foreground. The documented levers are all skill-level (`background: false` in frontmatter — not editable on a bundled skill) or session-level (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, which also kills every other background feature). `skillOverrides` controls visibility only, not execution mode. A child therefore cannot *request* synchronous behavior.

What each child kind gets:

| Child kind | Mode | Basis |
| --- | --- | --- |
| **Teams path** — a named `Agent`/`Task` spawn, i.e. an in-process team teammate | **Foreground, guaranteed.** A teammate's own subagents run in the foreground; asking for a background one *errors*, because a teammate's background work cannot outlive the lead's process. | Documented (`/docs/en/agent-teams`, "Limitations"; `/docs/en/sub-agents`, "How Claude Code decides foreground vs background" — the teammate bullet outranks the fork/background bullet). |
| **Subagents path** — a plain unnamed `Agent` spawn, this skill's **inline default** | **Backgrounds.** The Skill call returns `Skill "code-review" launched (forked execution, running in the background). Running in the background as @code-review-N` — a handle, not findings. | Measured directly (one `general-purpose` subagent, `tools: *`, 2026-08). The docs do not cover this case; this is the experiment that settled it. |

**And the obvious escape hatch does not exist: `TaskOutput` is not in a subagent's toolset.** The same experiment found it absent from the subagent's loaded schemas *and* from its ToolSearch deferred list, so a child cannot drain the handle it was just given. (`TaskList` returned `No tasks found` — the forked skill agent isn't registered in that namespace either. The text handle `@code-review-N` is also a different identifier from the task-id in the completion notification, so even a working drain tool would need translation.) Earlier revisions of this file told children to "collect it in-turn with `TaskOutput`" — that instruction was unexecutable.

The findings *did* arrive as a push notification into that subagent's own turn about 8 seconds later, so the case is not hopeless — but that was a no-op review on an empty diff. A real review runs for minutes, and nothing establishes the child's turn survives that wait. Reading the diff directly is bounded, park-proof, and needs no tool the child lacks.

**A nested `Agent` call is NOT an escape hatch.** This file previously claimed that a review escalating to a Claude-based path spawning **nested Agent calls** would "block and return synchronously to the caller" and therefore carry no parking risk. That claim is false, and believing it is precisely how a child parks: a nested `Agent` call returns an **async handle even with `run_in_background: false`**, and its completion notification routes to the **manager**, not to the child that spawned it. Dispatching a nested reviewer and then ending the turn parks exactly as hard as backgrounding a Bash call. The rule is therefore *not* "avoid backgrounded shell-outs" — it is the broader invariant below.

## Invariant: a subagent must never end its turn waiting on anything it did not itself synchronously complete

**Every completion notification in this harness routes to the manager**, never to the child that started the work. So a child that ends its turn waiting is waiting on a signal that will never arrive. This covers *all* out-of-band work a child can start — `run_in_background` Bash tasks, background task handles, and nested `Agent` calls alike.

For a child, in priority order:

1. **Do the work in the foreground yourself.** For a review that means: read `git diff <base-branch>...HEAD`, apply clearly-useful fixes, and commit. No `Agent` call, nothing to await.
2. **If something you called nevertheless returned an async handle, assume you cannot drain it.** `TaskOutput` is not in a subagent's toolset (measured — see the table above), so there is no pull channel. Abandon the handle and fall back to step 1. Never wait passively for a notification.
3. **If you cannot collect it in-turn, abandon it and do the work yourself** (step 1). A self-done foreground pass is strictly better than a parked turn.

A message like "review still running / waiting on a notification / I'll report when it lands" is a **parked report, not a completion report** — the Step 6 merge gate does not open on it and the manager must nudge you. This invariant is the canonical statement referenced by `skills/codex-review/SKILL.md` (Step 4 fallback), `skills/x-wt-teams/references/reviewer-modes.md` ("Child self-review"), and `references/child-brief.md` ("Self-review must not park").

## Mixed-mode degradation rationale

When the markers say "topic A: subagents, topic B: teams," in principle topic A could run as a subagent and topic B as a team teammate. The skill deliberately does NOT do this:

- It would require maintaining two parallel spawn paths in the same session, with two cleanup paths.
- A team teammate cannot SendMessage to a non-team subagent, so if topic B's `teams` rationale was "peers with topic A," the assumption breaks anyway.
- Falling back to teams for the whole session is a safe superset — topics that would have worked as subagents still work as team teammates, just with the usual coordination overhead.

When this turns out to be too coarse in practice (e.g. one specialty `teams` topic forces an otherwise-clean subagents session into team mode), the fix is to re-plan with `/big-plan` and challenge that one topic — not to add mixed-mode support.
