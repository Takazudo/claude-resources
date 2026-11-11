---
name: zdev
description: "Plan Takazudo development work in this chat, optionally prototype UI or sweep issues, and deliver a standalone prompt for Codex, Claude Code or Grok in one of nine cloud/local environments. Use for /zdev, 'plan here, implement elsewhere', continuous issue-sweep handoffs (-a)."
argument-hint: <request> [-pr] [-is|-isask|-a] [-m] [-cccp|-coc|-cowsl|-comac|-ccwsl|-ccmac|-grmac|-grwsl|-grc …] [-zip|-dropbox|-temp]
---

# zdev

Claude Code port of the ChatGPT `zdev` plugin (`Takazudo/chatgpt-zdev`). This session is a
**planning chat** — usually the Claude app or Claude Code on the web. It researches the target repo
read-only, optionally runs a UI prototype loop or an issue sweep, and finishes with one complete,
copyable execution prompt that the user runs in a **separate** session. Prototyping is one feature;
`zdev` is just as often used only to work out an implementation plan.

The original plugin's sub-skills are folded in as references: `zplan` → [zplan](references/zplan.md),
`zproto` → [zproto](references/zproto.md), `zgh` → [zgh](references/zgh.md).

Read [the workflow contract](references/workflow-contract.md), [the handoff rules](references/handoff.md),
[implementation tracking](references/implementation-tracking.md), [delivery](references/delivery.md),
[terminal resource cleanup](references/resource-cleanup.md), and the relevant `zplan`, `zproto` or
`zgh` reference.

Read [execution environments](references/execution-environments.md) for the allowed-set selection and
scope filter. Read [Claude Code Cloud Project execution](references/claude-code-cloud-project.md) only
when that environment is selected. For `-a`, read
[continuous development](references/continuous-development.md) and
[the sweep procedure](references/issue-sweep.md).

- **Get the code first.** On web or the app, attach and clone the target repo (`add_repo`). A planning
  chat with no code to read says so before anything else.
- During this planning session, GitHub and repository history are read-only: do not create or update
  issues, epics, labels, comments, branches or PRs; do not commit, push, close or merge. This includes
  subagents. **The only exception is the `-temp` delivery channel** (one resource branch + draft PR,
  see [delivery](references/delivery.md)). Production code in the target repo is never edited here.
- Return a complete standalone prompt plus necessary artifacts. Require the separate implementing agent
  to establish or reuse a tracker or epic with sub-issues before implementation, keep development
  notes in those issues, and close them on verified completion under the authorized integration
  lifecycle. Prepare concrete issue content here without posting it.
- `zdev` is the sole planning entry point. Route rough development requests here in the current chat.
- Route `-pr`/`--prototype` through the accepted UI feedback loop ([zproto](references/zproto.md):
  private Artifact previews, explicit acceptance) before freezing the handoff. Route explicit
  `-is`/`--issuesweep`/`--issue-sweep`, `-isask`/`--issue-sweep-ask`, and `-a` through the sweep
  procedure. An explicit `-isask` interview wins over the other sweep modes.
- `-cccp`, `-coc`, `-cowsl`, `-comac`, `-ccwsl`, `-ccmac`, `-grmac`, `-grwsl` and `-grc` form a
  deduplicated allowed environment set. Normalize `- cccp` to `-cccp`. Choose by requirements when
  unconstrained, enforce one environment as a hard scope constraint, and select only from multiple
  allowed candidates. Exclude tasks whose required implementation or acceptance cannot finish there;
  refilter every continuous wave. For portable unconstrained work, explicitly say the prompt can run in
  any supported environment. Apply Project child sessions only when Project is selected; local CLI
  children are subagents owning coherent substantive topics. Environment flags do not imply continuous
  development or merge authorization. Grok CLI on Mac/WSL has no computer-use capability and uses a
  less capable model: prefer small, explicitly verifiable daily tasks and do not assign work requiring
  unsupported GUI interaction. Grok bot cloud is a Codex Cloud-like host, not a Project or local CLI
  session.
- `-a` requests an autonomous issue sweep and a repeated inspect → plan → implement → review → verify
  → integrate when authorized → resweep loop on every supported environment, including a local parent
  running sequentially. Ground the first wave here and include the entire continuation procedure in
  the prompt. The explicit mode accepts routine in-scope defect work without another bulk approval;
  preserve decision, no-auto, human/platform/access holds, an explicit interview, and UI acceptance. It
  does not imply merge authorization.
- `-m`/`--merge` is the author's explicit request to merge after development, not merely permission to
  consider merging. Carry that instruction into the execution prompt and complete the merge after the
  required gates pass, including when the repository's existing automation updates published websites
  or services on merge. Do not skip or reconfirm the merge solely for that automatic effect; disclose
  it. Without this flag or an equally explicit merge instruction, do not infer merge intent. Planning
  stays read-only; review, verification, repository policy, actual permissions and higher-priority
  safety requirements still apply. Separate deployment, release or publication actions need their own
  authorization.
- `-zip`, `-dropbox`, `-temp` choose how session files reach the implementer (combinable). With none,
  ask once at delivery time. Follow [delivery](references/delivery.md); prototypes may hold private
  information, so check exposure before each write.
- Forward normalized flags to the zplan procedure internally, then express their effective meaning as
  ordinary actions in the final prompt. Honor explicit prose constraints without inferring extra flags
  or permissions from the current runtime. Explain unknown flags instead of silently dropping them.
- Every implementation handoff must inline the terminal resource audit: protect and classify diffs,
  return a safe local checkout, reconcile owned worktrees/branches/issues/PRs, keep unmerged PR
  branches, and report retained or blocked cleanup. For delegated work, require child cleanup manifests
  and a manager-owned retry of denied remote branch deletions only after independent safety/permission
  checks; apply especially to local Grok CLI and Grok bot → Cursor arrangements. The implementing
  session performs this audit, not the read-only planning chat.
- Write for the user's chosen Codex, Claude Code, or Grok session, local or cloud. Include the entire
  workflow in plain language; do not include skill names, app links, private skill calls, raw planner
  flags or instructions to use this flow in the execution prompt.
- Finish with the complete accepted brief, the delivered files (or `Artifacts: none required`), and one
  complete copyable execution prompt in a fenced `text` block. It must work without this skill set or
  chat history. Final-report headings carry the verdict (global CLAUDE.md).
- The ChatGPT plugin's `zstatus` / `zwatch` observation routes and `zkicadactions` are not part of this
  port.
