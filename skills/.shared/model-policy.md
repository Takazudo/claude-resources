# Claude task model policy

This reference governs big-plan, x-wt-teams, x-as-pr, and fresh implementation
handoffs. Defaults do not modify global configuration or paid usage settings.

| Role/task | Model recommendation | Claude effort recommendation |
| --- | --- | --- |
| Existing planner | Keep current settings | Keep current settings |
| Fresh consequential planner | fable | high |
| Accepted-plan implementation manager | opus | medium |
| Ordinary specified worker | sonnet | medium |
| Difficult bounded worker | opus | high |
| High-risk design/unresolved hard work | fable | high |
| Genuinely mechanical exception | haiku | low, when supported |
| Routine review | Existing built-in reviewer | Its user-selected/default level |
| Consequential integration review | Strong independent reviewer | high, where supported |

Preserve `**Model:** fable|opus|sonnet|haiku — reason`. Missing/invalid annotations
fall back to Sonnet with a diagnostic and task-risk assessment. A fixed rename can
use Haiku; a specified feature uses Sonnet; a race invariant uses Opus; unresolved
cross-cutting design uses Fable. After the decision is settled, use Sonnet for its
specified implementation. User choices are scoped independently to each role.

## Decisions, overrides, and evidence

Keep an already-running strong planner. Do not relaunch it to satisfy a default or
add planning layers to an accepted plan. Separate planning manager, implementation
manager, individual worker, and reviewer choices; model capability and reasoning
effort are separate controls. Optimize total cost to verified completion.

Explicit scoped user model/effort choices override defaults and planner hints.
The manager may revise a recommendation using task evidence: uncertainty, impact,
failed hypotheses, and test results, never an executor's confidence alone. Preserve
user choices in a self-contained handoff; workflow merge/review flags do not select
models. Explain each selection once: role, model/effort, and one task-specific reason.

Escalate reasoning for difficult bounded diagnosis; use a stronger model for
unresolved hard failures or high-risk design. After the uncertain decision is
resolved and checks establish the contract, return bounded implementation to the
ordinary default. Two failed fixes call for isolation and hypothesis reassessment,
not an automatic expensive retry. Auth, network, quota, missing tools, and other
infrastructure failures require environment recovery or blocker reporting.

## Supported dispatch and fallback

Inspect the actual dispatch API and provider/version before passing controls.
Native agents and cloud tasks have different model, effort, and inheritance fields;
some support partial context and others do not. If overrides require no fork, send
a self-contained handoff with the supported no-fork value. A prompt recommendation
cannot change settings, and a manager cannot claim automatic self-switching.
Record requested settings, selection source, supported dispatch arguments, and
observed settings separately; mark actual values unknown when unverifiable.

Unavailable strict user requirements or unresolved high-risk work stop/report the
affected task. For bounded work only, an optional supported fallback must be
disclosed before dispatch and validated against the same acceptance checks. Do not
silently raise cost or lower required capability, equate stronger and weaker models,
or retry uncertain launches blindly. If no acceptable alternative exists, report
the blocker. Unsupported controls may inherit only when the task/user permits it;
record the inherited/unknown setting rather than claiming an override. Provider
substitution is observed behavior, not a policy-selected model.

Claude effort is not Codex reasoning effort, and a built-in review level is not
proof of a dispatched model setting. Check the live Agent schema: use per-worker
`effort` only when supported (documented for non-fork agents since v2.1.292);
otherwise record inherited/unknown effort. Teams may expose different controls.
Session launches support `--model` and, on supporting versions, `--effort`.
Explicit environment/organization controls may take precedence or cap effort.
Current model precedence also depends on version and forced subagent settings;
observe runtime results rather than asserting that every manager is Opus or every
reviewer inherits it. Children keep foreground manual self-review; reviewers and
fix workers have separate settings.

Optional bounded alternatives (for example Fable to Opus or Haiku to Sonnet) need
cost/capability disclosure and the same verification; they are not automatic or
equivalent. Unresolved high-risk work and strict user requirements stop/report.
Do not silently add paid usage, change accounts, or switch providers.

Provider controls: https://code.claude.com/docs/en/model-config and
https://code.claude.com/docs/en/sub-agents. Documentation is not account availability
or a live launch test.
