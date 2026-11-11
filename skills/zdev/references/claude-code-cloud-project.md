# Claude Code Cloud Project execution

Use this reference only when Claude Code Cloud Project is selected after applying [execution environments](execution-environments.md). An explicit `-cccp` (including `- cccp`) or prose constraint allows this environment; when it is one of several candidates, resolve the sufficient host first. Do not apply Project instructions when another allowed host is selected. The destination is the user's Claude Code Cloud Project team platform, where a manager session can raise child sessions. It is not a claim that every Claude Code host provides the same orchestration API.

## Plan the manager and child roles

- Keep strategic planning, difficult judgments, queue ownership, review and integration with a capable manager session. Preserve any user-selected model; otherwise let the host choose an appropriate available model. Do not invent model identifiers, prices, session commands or concurrency limits.
- Inspect repository instructions for worktree layout, commit/push ownership, branch protection, CI and platform requirements. Put actual constraints in the handoff. If the repository reserves pushes for the manager, children commit locally and return their commit IDs; do not grant them conflicting push authority.
- Delegate bounded, independently completable investigations, implementations or reviews. Each child receives the repository and base revision, issue/task scope, owned paths or resources, dependencies, acceptance criteria, verification and return contract. Serialize overlapping edits and shared state through the manager; use isolated worktrees or the Project's supported isolation where appropriate.
- Require children to return findings, changed paths, actual commit/PR references, commands and observed results, unresolved questions and next steps. A reported pass or completed session is evidence to inspect, not automatic acceptance. The manager reviews integration and current-head checks.
- Discover the Project's actual child-session and communication capabilities before launching work. Use only supported operations. If unavailable, report the limitation and continue independent manager-owned work; do not claim delegation occurred or silently switch to another environment.
- Reuse active or completed child work after reading its state. Reuse the same child for follow-ups within its topic; split only for independent outcomes, ownership/capability boundaries or an unmanageable topic. Do not start duplicate workers for a task merely because the manager resumed or its context compacted. Keep canonical task, issue, branch and child-session mappings in durable tracking.

This environment flag alone does not request a sweep, a continuous loop, a merge, a release or a deployment. When `-a` is also selected, combine this reference with [continuous development](continuous-development.md). Planning and its delegated research helpers remain read-only; the separate Project session receives the actual implementation permissions from the standalone prompt.

## Plain-language handoff addition

Adapt this section into the single complete execution prompt. Replace generic ownership with verified repository rules. Do not pass the flag or this reference to the consumer.

```text
Run this work in Claude Code Cloud using the Project feature. Keep the manager session responsible for the task queue, planning, difficult decisions, review, integration and final status. Use available child sessions for bounded independent investigations, implementation and review, with explicit base revisions, scope, ownership, dependencies, acceptance criteria and verification. Preserve the chosen model settings and use only orchestration capabilities actually available in this Project.

Follow the repository's worktree and commit/push ownership rules. Isolate independent edits and serialize shared-file or shared-resource conflicts. Have each child return its findings, changed paths, actual commit references, observed checks, blockers and next action. Review the results and integrated diff before accepting completion; verify the current integration head rather than trusting a child's completion message. If child sessions are unavailable, report that limitation and continue independent manager-owned work without claiming delegation occurred.

Keep canonical issue, branch and child-session mappings in the durable tracker. After interruption or compaction, recover this state and inspect existing worker and remote results before assigning work again. Do not create duplicate tasks, workers, issues or PRs.
```
