# Execution environments

Read this contract before selecting executable scope or adding environment-specific handoff instructions. Environment arguments form a deduplicated allowed set, not an ordered preference list. Normalize the harmless spaced spelling `- cccp` to `-cccp`. Honor explicit environment constraints stated in prose as well as flags; the current planning or implementation host never supplies extra permission.

| Flag | Allowed execution environment | Worker meaning when selected |
| --- | --- | --- |
| `-cccp` | Claude Code Cloud using the Project feature | Project manager and available child sessions |
| `-coc` | Codex Cloud | Only the tools and workers actually available there |
| `-cowsl` | Codex local CLI on WSL | Local subagents when supported |
| `-comac` | Codex local CLI on Mac | Local subagents when supported |
| `-ccwsl` | Claude Code local CLI on WSL | Local subagents when supported |
| `-ccmac` | Claude Code local CLI on Mac | Local subagents when supported |
| `-grmac` | Grok local CLI on Mac | Smaller daily tasks; local subagents only if actually supported; no computer use |
| `-grwsl` | Grok local CLI on WSL | Smaller daily tasks; local subagents only if actually supported; no computer use |
| `-grc` | Grok bot cloud | Codex Cloud-like cloud worker; only actual tools and workers available there |

## Select an environment and a fully completable scope

1. Determine each task's implementation and acceptance requirements before selecting its host. Include mandatory native application, operating-system, hardware, physical-input, credential and human evidence. A host label describes the intended destination; it is not evidence that its tools, credentials or physical setup are available.
2. With no environment flag or prose constraint, choose by task requirements. If mandatory Mac confirmation is required, choose an appropriate Mac environment. If there is no host-specific requirement, keep the prompt portable and explicitly state: **This prompt can run in any supported environment.** Do not default to the current implementation session's host or assume cloud execution.
3. With one allowed environment, treat it as a hard scope constraint. Include only work whose implementation and all required acceptance can be completed there. Inseparable Mac-required work is environment-excluded from a WSL batch; do not start or assign it there, even with an honest plan to defer Mac acceptance. Record the original issue, unmet requirement and suitable environment, and continue compatible work.
4. With multiple allowed environments, select only from that set. Do not use first-wins or last-wins parsing, do not require every candidate to run, and prefer one sufficient environment. Different independent tasks may select different allowed hosts only when needed and with explicit handoff boundaries. If none can complete a task, mark it environment-excluded. If no task fits, report an empty compatible executable scope; do not invent replacement work.
5. An independently useful portable slice may proceed only with its own fully satisfiable acceptance criteria. Keep the larger original issue open until all of its criteria are met. Name the slice's boundary and omitted requirement; splitting must not disguise an inseparable acceptance gap.
6. CI may run legitimate repository gates, including existing platform CI, but never adds an implicit allowed execution environment or substitutes for required native, physical or human evidence. If actual capabilities are unavailable at execution time, record a capability blocker and next action; continue independent compatible tasks without silently switching outside the allowed set.
7. Reapply this environment filter before every new wave and newly discovered task, including continuous development. Consider the selected worker's real capability as well as OS: Grok CLI has no computer-use interaction and a less capable model, so favor smaller, routine, explicitly verifiable tasks rather than assuming it can complete complex, ambiguous work. A missing mandatory GUI acceptance path excludes an inseparable task before assignment. Distinguish environment-excluded work from decisions, actual capability/access blockers, verification blockers and user-protected holds. Carry all dispositions and their evidence in the durable checkpoint.

Resolve explicit conflicting constraints from the user's stated scope, doing useful compatible planning first. Ask only for a missing decision that prevents a valid selection; never infer authority to widen the allowed set. Environment selection does not grant continuous development, merge, deployment, release or publication authority.

## Apply only the selected worker model

Read and inline [Project execution](claude-code-cloud-project.md) only when Claude Code Cloud Project is selected. Merely having `-cccp` among the candidates does not enable Project manager/child instructions. For example, `-cccp -comac` with mandatory Mac acceptance selects Codex local CLI on Mac and uses local subagents when available; it does not inject Project session APIs.

For a selected local CLI environment, child work means **subagents**, not independent Project child sessions. Prefer one coherent substantive topic per subagent, with a clear outcome, owned paths, acceptance criteria and dependencies. A topic can span multiple files or closely related issues and include investigation → planning → implementation → self-review and focused testing; avoid fragmenting it into trivial commands or tiny edits. Reuse the same subagent for follow-ups and corrections within its topic. Split only for independent outcomes, ownership or capability boundaries, or an unmanageable topic; do not split per file or tiny step. The parent owns the queue, cross-topic decisions, integration and independent review of the integrated result, and serializes overlapping edits. Follow the repository's push policy, including manager-only pushes when required. If no subagent support is available, the parent proceeds sequentially. Continuous development may assign the next topic to an available subagent after a completed wave. Before a subagent stops, it must audit and report its owned changes, local branch/worktree state and any failed resource cleanup; the parent retains responsibility for final integration, safe primary checkout and remote resource reconciliation. If a worker's remote branch deletion is denied, the parent rechecks merge/dependency state and retries only when independently authorized. Do not assume a cloud manager can clean a worker's local filesystem.

Use capable workers at the user's selected or configured model and effort. Examples such as Opus at medium effort or Astra at low effort describe the intended capable worker level where offered, not universal version identifiers or permission to override model settings. Discover actual host capabilities, preserve chosen models and effort unless the user explicitly changes them, and respect cost and concurrency limits. Do not invent SDK/tool names or create artificial fan-out. Codex Cloud uses its actual available worker facilities; do not assume local CLI subagent APIs or Project child-session APIs. Grok bot cloud likewise uses only actual cloud facilities; it is not automatically a Codex worker, a local CLI, or a Claude Code Project.

## Copyable environment addition

Resolve the placeholders to ordinary environment names, selected host or portable status, and concrete task dispositions. Never copy planner flags into the execution prompt. Include the applicable worker procedure above in plain language; Project instructions apply only after Project is selected.

```text
Allowed execution environments: <expand the actual allowed names; when unconstrained list all nine: Claude Code Cloud using the Project feature, Codex Cloud, Codex local CLI on WSL, Codex local CLI on Mac, Claude Code local CLI on WSL, Claude Code local CLI on Mac, Grok local CLI on Mac, Grok local CLI on WSL, and Grok bot cloud>.
Selected execution environment: <one sufficient allowed host, explicit task-to-host boundaries when necessary, or “This prompt can run in any supported environment” when portable>.
Before choosing each task and every new wave, check that its implementation and all required acceptance evidence can be completed within the allowed environments. Record incompatible tasks as environment-excluded with their original issue, unmet requirement and suitable environment. Do not start or assign an inseparable task whose required implementation or acceptance needs an environment outside the allowed set; keep it out of executable scope. An independently useful portable slice may proceed only with its own fully satisfiable acceptance criteria; keep the larger issue open.
CI may satisfy legitimate repository gates but does not expand the allowed environments or replace required native, physical or human evidence. Verify actual tools and access on the selected host. If a capability is unavailable, record the exact blocker and next action, continue compatible independent work, and do not silently switch outside the allowed set. If nothing is compatible, report that empty executable scope honestly.
```

## Copyable local CLI worker addition

Use only for a selected local CLI environment. Substitute any known worker settings without inventing a model name or effort option.

```text
Use local subagents when this CLI supports them. Assign one coherent substantive topic to each subagent, with its outcome, owned paths, acceptance criteria and dependencies; let it investigate, plan, implement, self-review and test the topic across the necessary files or closely related issues. Reuse the same subagent for follow-ups and corrections within its topic. Split only for independent outcomes, ownership or capability boundaries, or an unmanageable topic, never per file or tiny step. Keep the parent responsible for the queue, cross-topic decisions, integration and independent review of the integrated result. Serialize overlapping edits, obey the repository's push policy, and avoid artificial fan-out. Use the selected or configured capable worker model and effort, respecting cost and concurrency limits. If subagents are unavailable, proceed sequentially in the parent. For continuing work, assign the next ready topic to an available subagent after refreshing scope and dependencies. Each worker must return a manifest of its owned branch/worktree, git status, retained changes and failed cleanup actions; the parent owns final reconciliation and authorized remote-delete retries.
```

## Copyable Grok local CLI capability addition

Use only when Grok local CLI on Mac or WSL is selected. This supplements the conditional local subagent procedure; it does not invent CLI tools or grant GUI access.

```text
Run this work in Grok local CLI on the selected Mac or WSL host. This is a lower-capability model intended for routine daily development, not a substitute for a high-capability architecture or investigation agent. Keep each implementation topic small, concrete and independently verifiable; use explicit file paths, expected behavior, targeted checks and evidence. If a complex task cannot be completed or verified reliably, document its blocker or split off only fully accepted independent slices rather than claiming completion.
Grok CLI has no computer-use capability: do not attempt desktop screen, pointer or GUI operations through computer-use tools. Use text/CLI workflows and actually available scripted automation instead. Do not claim native visual or physical acceptance without observed evidence. If an inseparable task requires unavailable GUI interaction or verification, exclude it from this host's executable scope; record the unmet requirement and suitable environment. Check whether subagents actually exist before assigning any; otherwise work sequentially. Preserve the configured model, repository policies and normal review/merge gates. In particular, end local Grok work by protecting all diffs, switching away from the completed topic branch to a safe original parent/default checkout when possible, removing only owned clean temporary worktrees, and explicitly reporting any retained branch or dirty status. If a Grok worker or external Cursor worker cannot delete a merged remote branch, pass its exact denial to the parent for a fresh authorized retry; never force deletion or treat a denied action as successful.
```

## Copyable Grok bot cloud capability addition

Use only when Grok bot cloud is selected; it is similar to Codex Cloud at the environment level, not an entitlement to Codex-specific tools.

```text
Run this work in the Grok bot cloud environment. Treat it as a cloud development host comparable to Codex Cloud, but discover its actual repository access, tools, workers, test facilities and approval boundaries before use. Do not assume a native Mac or WSL desktop, computer-use/GUI interaction, local CLI subagents or Claude Code Project child sessions. Select tasks whose implementation and mandatory acceptance can complete using its verified capabilities; record missing access or verification as concrete blockers and keep unrelated compatible work moving. Use normal issue tracking, review, CI and authorized merge gates without inventing host APIs. When managing an external/local worker such as Cursor, collect its branch, worktree, diff and cleanup manifest. Recheck the PR and remote ref before retrying any remote deletion that the worker could not authorize. Retry only with credentials the cloud manager actually possesses; leave denied/protected refs intact and report them. The worker must independently return its own local checkout to a safe branch and verify local status.
```
