# Tracking in the implementation session

This reference governs what the producer writes into the standalone execution prompt. It does not authorize GitHub writes from the zdev planning session or its helpers. The user starts a separate Codex, Claude Code, or Grok session, locally or in the cloud, with that prompt. Its first development step after repository/state inspection is to establish tracking, before changing implementation code.

## Choose and establish the records

- Reuse a matching open tracker or epic and suitable children after reading their scope, comments and state. Search before creating missing records, including after a resumed session or uncertain creation response. Preserve the canonical URLs so compaction or a retry does not create duplicates.
- Use one tracker for a focused task. Use one parent epic plus sub-issues for multiple independently completable tasks. Do not force a large hierarchy or multiple PRs onto a small change. Reuse selected existing delivery issues as children where appropriate instead of replacing them.
- The execution prompt explicitly authorizes the in-scope issue creation, updates, milestone comments and completion closures it requests. Do not add a generic confirmation gate for these already requested operations. Actual tool permissions, repository policies and explicit user restrictions still apply. Do not imply that local/cloud agents have guaranteed credentials or can bypass approval controls.
- If GitHub writes are genuinely unavailable, preserve the exact proposed issue content and task mapping in an available local handoff, report the failed operation and missing access, and continue independent authorized work. Do not claim creation, silently omit tracking, retry a denied operation through a bypass, or send posting back to the planning Chat.

## Make the issues useful to future sessions

The parent or single tracker contains the goal, accepted scope and non-goals, decisions and rationale, target branch/base evidence, dependencies and implementation order, task links, acceptance criteria, verification plan, artifact locators and integration policy. Each child contains its own concrete requirement, affected components, prerequisites, acceptance criteria and checks. Restate the needed specification; links supplement it. A later agent should not need the originating Chat, private skills or an undocumented machine-local log to understand the work.

Map stable planning task keys to actual issue URLs after creation. Add parent-to-child and child-to-parent body links; use native sub-issue relationships where supported and report honestly when only body links were possible. Read back all created or changed records. Re-read before replacing a body and preserve existing context, coordination markers and other contributors' work.

Use issue comments as a concise chronological development record. Update at meaningful milestones, changed decisions, failed or completed verification, blockers, and before a pause or handoff. Record what changed and why, relevant commit/PR links, commands and observed results with revisions, what remains and the next action. Keep the parent checklist and child status consistent. Avoid posting a transcript of routine tool output or claiming planned checks passed.

## Keep continuous sessions resumable

For continuous development, retain one canonical parent/single tracker and map the evolving queue to real task issues instead of creating a new epic every cycle. Add newly discovered in-scope defects only after searching for matching records. Keep a separate decision register and blocker register, with exact questions or missing access/platform/human evidence, recommendations where relevant, affected tasks and next actions. A verification hold is not a completed task or necessarily a product decision.

At each meaningful batch boundary and before compaction, interruption or handoff, checkpoint the target and working SHAs, queue/dispositions, accepted decisions, task/issue/PR/branch/child-session mappings, actual checks and failures, integration state and precise next action. On resume, read this checkpoint and current remote/worker state before assigning work or retrying writes. Preserve existing findings and active children; do not recreate trackers, PRs or workers because context was lost. A queue with no ready tasks can still have open delivery issues and an incomplete parent.

## Close on verified completion

Issue creation and a submitted PR are progress, not delivery. For implementation work, close a child or single tracker only after its acceptance criteria and required verification pass and its changes are confirmed integrated into the intended target. Without merge authorization, leave the PR and delivery issues open with honest status and links. With merge authorization, preserve all review, approval and current-head CI gates; close completed children after integration, then close the parent only when its entire accepted scope is complete.

For a genuinely non-code task, completion is its explicit accepted deliverable and verification; do not invent a merge requirement. Do not close incomplete, blocked, unrelated or merely superseded source issues. Preserve their remaining requirements and link the new records where useful. Leave a final completion note with outcome, evidence and any separately tracked remaining work before closure. Report actual URLs and final states.

## Environment and worker continuity

Record the resolved allowed environment names, selected sufficient host or explicit portability, and any task-to-host boundaries in the canonical tracker and every continuation checkpoint. Keep environment-excluded issues, their unmet implementation or acceptance requirement and suitable host distinct from decisions, actual access/capability failures, verification blockers and protected holds. Reapply the environment filter before adding newly discovered work to a continuous wave. A completed portable slice does not complete the larger issue when required acceptance remains.

For selected local CLI execution, children are subagents. Track one coherent substantive topic per subagent, including its outcome, owned paths, acceptance criteria, dependencies and current evidence. Reuse the same subagent for topic follow-ups; split only when independent outcomes, ownership/capability boundaries or unmanageability justify it. The parent owns cross-topic decisions, integration and independent review of the integrated result; serialize overlapping edits and obey repository push policy. Resume from existing worker and tracker state rather than duplicating it.
