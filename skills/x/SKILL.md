---
name: x
description: "Facade for development workflows. Routes on two axes: plan-first vs implement-now (escalates to /big-plan -a when the request needs research / decomposition / has unclear scope — the appended -a makes the plan chain into implementation in-session), then single vs multi on the ready-to-build fast paths (/x-as-pr single-topic, /x-wt-teams multi-topic parallel). Use when: (1) User says '/x' followed by dev instructions, (2) User wants to start development without choosing the workflow skill, (3) User says 'dev', 'implement', or 'build' with a task. Default option: -v (verify-ui). Review-loop (-l) is opt-in — without -l the downstream skill runs a single /deep-review pass. Forwards -a (autonomy/auto-chain) and -m (merge at the end + cleanup + CI watch) through every route; auto-fix of raised findings (-f) and issue-raising (-ri) are downstream defaults, with -nf/--no-fix and -nori/--no-raise-issues as the forwarded opt-outs. -a and -m are orthogonal — full hands-off end-to-end is -a -m."
argument-hint: "[-op|-so|-haiku] [-co|--codex] [-gco|--github-copilot] [-t-op|--team-opus] [-t-so|--team-sonnet] [-a|--auto] [-m|--merge] [-f|-fix|--auto-fix] [-nf|--no-fix] [-s|--stay] [-nor|--no-review] [-ri|--raise-issues] [-nori|--no-raise-issues] [options] <instructions>"
---

# X — Development Workflow Facade

Route development requests to the right workflow skill: `/x-as-pr` (single-topic) or `/x-wt-teams` (multi-topic parallel).

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md) — GitHub via the GitHub MCP (not `gh`), Claude-only (ignore Codex `-co` / Copilot `-gco`), subagents-only (no agent teams; route multi-topic work to subagent fan-out, not the teams path), no Dropbox.

## !! CRITICAL — PR TARGET BRANCH RULE !!

**The downstream skill MUST target the current (invocation) branch, NOT the repository's default branch.**

Before routing, record the current branch:

```bash
INVOCATION_BRANCH=$(git branch --show-current)
```

When you hand off to `/x-as-pr` or `/x-wt-teams`, the resulting PR's **base** (target) MUST be `$INVOCATION_BRANCH` — not `main`, not `master`, not the repo default — unless the user explicitly typed a different base.

**Concrete example (this is the bug we are preventing):**

```
Current branch: topic/foo-bar
User runs:      /x do blah blah...
CORRECT:        new branch topic/moo-mew → PR targets topic/foo-bar
WRONG:          new branch topic/moo-mew → PR targets main   ← DO NOT DO THIS
```

If you find yourself about to run `gh pr create` without `--base`, STOP — `gh` defaults to the repo default branch. Always pass `--base "$INVOCATION_BRANCH"` explicitly unless the user specified a different base.

This rule propagates to the downstream skill. The downstream skill restates it, but the facade also carries it so the rule is visible from the first moment.

## Auto-Pilot Behavior (Always On)

This skill is an orchestration entry point for long-running autonomous work. When invoked, behave as if Auto Mode is active — regardless of session mode:

1. **Execute immediately** — start implementing right away. Make reasonable assumptions and proceed on low-risk work.
2. **Minimize interruptions** — prefer making reasonable assumptions over asking questions for routine decisions.
3. **Prefer action over planning** — do not enter plan mode unless the user explicitly asks. When in doubt, start coding.
4. **Expect course corrections** — treat mid-run user input as normal corrections, not failures.
5. **Do not take overly destructive actions** — deleting data, force-pushing, or modifying shared/production systems still needs explicit confirmation.
6. **Avoid data exfiltration** — do not post to external platforms or share secrets unless the user has authorized that specific destination.

These rules apply to the facade itself and propagate to the chosen downstream skill (`/x-as-pr` or `/x-wt-teams`), which carry the same auto-pilot defaults.

## Input Parsing

Parse `$ARGUMENTS` for:

- **All flags from both skills** (`-op`, `--opus`, `-so`, `--sonnet`, `-haiku`, `--haiku`, `-co`, `--codex`, `-gco`, `--github-copilot`, `-t-op`, `--team-opus`, `-t-so`, `--team-sonnet`, `--make-issue`, `--issue`, `-s`, `--stay`, `-l`, `--review-loop`, `-v`, `--verify-ui`, `-nor`, `--no-review`, `-ri`, `--raise-issues`, `-nori`, `--no-raise-issues`, `--no-issue`, `-a`, `--auto`, `-m`, `--merge`, `-f`, `-fix`, `--auto-fix`, `-nf`, `--no-fix`, etc.)
- **GitHub issue URL or number**
- **Implementation instructions** (remaining text)

### Default Options

If NO flags are passed (just instructions or an issue), apply this default:

- `-v` (verify-ui)

Review-loop (`-l`) is **NOT** added by default — for most tasks a single `/deep-review` pass is enough and the 5-round loop is overkill. The user must pass `-l` explicitly to opt in.

If any flags ARE passed explicitly, use those as-is — do NOT add the `-v` default either.

### Reviewer flags

`-op` / `-so` / `-haiku` and `-co` / `-gco` are **reviewer flags** — they change which reviewer(s) run, not subagents or team members. Forward them all to the chosen skill.

- `-op` / `-so` / `-haiku` — Claude reviewer model for `/deep-review` / `/review-loop`; `-op` / `--opus` = Opus 4.8 (Anthropic's top model; runs with a 1M-token context window). Pick at most one.
- `-co` / `--codex` — add codex reviewer (`/codex-review`) plus codex writer / research.
- `-gco` / `--github-copilot` — add GitHub Copilot CLI reviewer (`/gco-review`, GPT-5.4) plus copilot 2nd opinion / research.

All reviewer flags **combine** — passing multiple means run every selected reviewer. **Default when no reviewer flag is passed at all**: `-co` — codex review (`/codex-review`); codex is the house default 2nd agent. See the target skill for substitution tables.

### Team-member flags (`-t-op` / `-t-so`)

`-t-op` / `--team-opus` and `-t-so` / `--team-sonnet` override the model used by spawned subagents and agent-team members (child worktree agents in `/x-wt-teams`, fix-delegation agents in `/x-as-pr`). Pick at most one. **Default: `opus`.** No `-t-haiku`. Forward to the chosen skill.

These do NOT affect reviewers and are orthogonal to all reviewer flags.

### Autonomy Mode (`-a` / `--auto`)

When `-a` or `--auto` is passed, forward it to the chosen skill. `-a` means "run the whole chain autonomously": `/big-plan -a` auto-creates the issues (skipping the confirmation wait) and chains straight into the implementation skill, and `/x-wt-teams -a` auto-continues multi-wave plans wave after wave instead of stopping at each hand-off. `-a` does **NOT** merge the final PR — merging is `-m`'s job. The two are orthogonal and compose: full hands-off end-to-end is `-a -m`.

### Merge Mode (`-m` / `--merge`)

When `-m` or `--merge` is passed, forward it to the chosen skill. When the final implementation is done, the downstream skill merges the PR into its base branch, runs the cleanup phase, and watches CI on the base branch (fixing it if it goes red) — via `/pr-complete` + `/watch-ci`. On the escalation path, `/big-plan` forwards `-m` into whichever implementation skill it chains into. Intended for safe-to-merge work; without `-m`, the workflow ends with a ready-but-unmerged PR.

**On web (web-mode.md §8):** the downstream merge runs **in-turn** — the agent polls CI via the GitHub MCP and merges in the same run once green, because web has no background-task wakeup to resume a backgrounded `/watch-ci`. So on web, `-a -m` must finish at a *merged* PR in one autonomous run; the agent must not stop at "PR ready, CI running, I'll check back" (the recurring "agent is waiting for my order to merge" failure). Off web this is inert — the terminal's background-poll path already auto-resumes.

### No Review Mode (`-nor` / `--no-review`)

When `-nor` or `--no-review` is passed, forward it to the chosen skill. The downstream skill skips the post-implementation review step entirely (no `/deep-review`, no `/review-loop`, no fix-delegation Agent) and goes straight from implementation to push / CI watch / PR revision. Use when the task is throwaway or you've already reviewed the changes yourself.

### Raise-Issues Mode (`-ri` / `--raise-issues`, default — and `-nori` / `--no-raise-issues` to suppress)

By default the downstream skill raises GitHub issues (labeled `agent-found`) for problems, bugs, or improvement possibilities found in code unrelated to the current task. `-ri` / `--raise-issues` is the explicit form of the default. Pass `-nori` / `--no-raise-issues` to suppress.

Forward whichever flag was on the invocation to the chosen skill. If neither was passed, no forwarding is needed — the downstream default already raises issues.

### Auto-Fix Mode (`-f` / `-fix` / `--auto-fix`, default — and `-nf` / `--no-fix` to skip)

Auto-fix is the downstream **default**: after the main work, `/x-as-pr` and `/x-wt-teams` triage the `agent-found` issues raised this session and auto-fix the safe subset before final cleanup. `-f` / `-fix` / `--auto-fix` is the explicit form of the default; pass `-nf` / `--no-fix` to skip the step and leave raised issues open for human triage. It requires `-ri` (the default) and is a no-op under `-nori`.

`/x` only **parses and forwards**: forward whichever flag was on the invocation to the chosen skill (and into the `/big-plan -a` escalation — see Strategy Selection). If neither was passed, no forwarding is needed — the downstream default already auto-fixes. See the chosen skill's "Auto-Fixing Raised Findings" step for behavior.

## Strategy Selection

Routing has **two axes**. Decide both before invoking anything.

**Axis 1 — plan-first vs implement-now.** Does the request need research, decomposition, or have unclear scope? If yes, escalate to `/big-plan -a` (it plans, then routes downstream to `/x-as-pr` or `/x-wt-teams` itself — so the single/multi decision stays in one place). If the work is ready to build, skip planning and go straight to a fast path.

**Axis 2 — single vs multi (fast paths only).** When the work is ready to build, decide between `/x-as-pr` (single cohesive topic) and `/x-wt-teams` (multiple independent topics). `/big-plan` makes this same decision downstream when you escalate, so you only apply Axis 2 on the fast paths.

### Use `/big-plan -a` (plan-first escalation) when

Escalate to planning when the request is research/decomposition-heavy or its scope is unclear:

- The request needs **investigation or research** before code can be written ("figure out how to…", "research the best way to…", an unfamiliar subsystem).
- The scope is **large or ill-defined** — many moving parts, cross-cutting changes, or a vague goal that needs to be broken into concrete sub-tasks first.
- The request is a **multi-phase build** where later phases depend on earlier ones landing correctly (planning sequences these into dependency waves).
- You cannot confidently pick `/x-as-pr` vs `/x-wt-teams` because the topic boundaries aren't yet clear — planning will surface them.

**`/x` appends `-a` on the escalation, even when the user didn't type it.** The user asked `/x` for action, so the plan must chain into the implementation skill in the same session — not end at a planning-only hand-off. `/big-plan -a` auto-creates the issues (skipping the Step 6 confirmation wait, with its own concern-signal fallbacks) and then auto-invokes the implementation skill. `/big-plan` keeps the single-vs-multi routing downstream (single-sub-issue plan → `/x-as-pr`; multi → `/x-wt-teams`), so there is no duplicated single/multi logic here.

**Forward `-m`, `-nf`, and `-nori` cleanly into the escalation:**

- `/x "big thing"` → `/big-plan -a` (plan + auto-implement; PR left ready-but-unmerged; auto-fix and issue-raising run by default downstream).
- `/x -a -m "big thing"` → `/big-plan -a -m` (plan + auto-implement + auto-merge + cleanup — full hands-off).
- `/x -nf "big thing"` → `/big-plan -a -nf` (the no-fix opt-out rides through `/big-plan`'s hand-off into the implementation skill, exactly like `-m`; `-nori` rides the same way).
- `-a` is appended by `/x` on every escalation (this replaces the retired `-impl` flag); user-typed `-m` / `-nf` / `-nori` ride along. Reviewer flags (`-op` / `-co` / `-gco`) pass through to `/big-plan` and shape its Step 5 plan review. Note that on the escalation path, implementation-only flags (`-v`, `-l`, `-t-op` / `-t-so`, reviewer flags) do NOT reach the implementation skill — `/big-plan` forwards only `-a`, `-m`, `-nf`, and `-nori` downstream (per its own rules). Only the fast paths forward the full implementation-flag set to `/x-as-pr` / `/x-wt-teams`.

**Guardrail (asymmetric cost — escalation is more expensive than a fast path):**

- **Clearly small / ready-to-build** → take the fast path directly (`/x-as-pr` or `/x-wt-teams`). Keep the "I roughly call `/x`" speed for small work — do NOT escalate small tasks into planning.
- **Clearly big / research-or-decomposition-heavy** → escalate to `/big-plan -a`.
- **Ambiguous** → ask **one** line before escalating, e.g. "This looks like it needs planning first — escalate to `/big-plan`, or build it directly? (plan / build)". Then proceed on the answer. **EXCEPTION: if `-a` / `--auto` was passed, do NOT ask — just escalate** (the user opted into autonomy). This one-line confirm is the only place `/x` ever pauses; it is NOT plan mode and must not drift into one (Auto-Pilot still prefers action).

### Use `/x-wt-teams` when (fast path, ready-to-build multi-topic)

- The task clearly involves **multiple independent topics** that can be worked on in parallel
- Keywords: "multiple", "several", "split into", "parallel", "topics", "worktree"
- The instructions contain a list of distinct features/changes (3+ items)
- The user explicitly asks for parallel development

### Use `/x-as-pr` when (fast path, ready-to-build single-topic)

- The task is a **single cohesive feature** or fix
- The task is small to medium scope
- The instructions describe one thing to do
- The user passes an issue URL/number and it is NOT an epic issue (see below)
- Single-vs-multi ambiguity (Axis 2) — prefer `/x-as-pr` as the simpler option. (This is distinct from plan-vs-build ambiguity, which Axis 1 resolves by escalating to `/big-plan -a`.)

### Epic Issue Detection

When the argument is a GitHub issue URL or number, fetch the issue title before routing:

```bash
gh issue view <number> --json title -q '.title'
# or for a URL: gh issue view <url> --json title -q '.title'
```

If the title contains `[Epic]` → route to `/x-wt-teams`.

Epic issues are created by `/big-plan` and contain multiple sub-issues meant for parallel agent teams — `/x-as-pr` cannot handle them correctly.

### Decision Examples

| Request | Route | Why |
|---------|-------|-----|
| "add pagination to the user list" | `/x-as-pr` | Single feature, ready to build |
| "fix the login bug #42" | `/x-as-pr` | Single fix, ready to build |
| "implement dark mode, add search, update footer" | `/x-wt-teams` | 3 independent topics, ready to build |
| "refactor the auth system" | `/x-as-pr` | One cohesive refactor, ready to build |
| "build the settings page with theme picker, notification prefs, and profile editor" | `/x-wt-teams` | 3 parallel-able sections, ready to build |
| "figure out how to add multi-tenancy and implement it" | `/big-plan -a` | Research + decomposition needed first |
| "rework the whole billing system to support usage-based pricing" | `/big-plan -a` | Large, ill-defined, multi-phase |
| "migrate the app to the new framework" | `/big-plan -a` | Cross-cutting; needs wave sequencing |
| `/x -a -m "overhaul onboarding end-to-end"` | `/big-plan -a -m` | Big + `-a -m` → escalate, no confirm, autonomous + auto-merge |
| "improve the dashboard somehow" (vague) | one-line confirm → likely `/big-plan -a` | Ambiguous scope; ask plan/build first (unless `-a`) |
| `https://github.com/owner/repo/issues/42` | `/x-as-pr` | Single issue, ready to build |
| `https://github.com/owner/repo/issues/42` (title has `[Epic]`) | `/x-wt-teams` | Epic issue from `/big-plan` (already planned) |

## Execution

Once the strategy is chosen, invoke the appropriate skill.

**Plan-first escalation (Axis 1 → big):** append `-a` (and forward `-m` / `-nf` / `-nori` if passed) and invoke `/big-plan`. `-a` is appended by `/x` even when the user didn't type it — `/x`'s contract is action, so the plan chains into implementation in-session.

```
Skill tool: skill="big-plan", args="-a <-m if passed> <-nf if passed> <-nori if passed> <other flags> <instructions-or-issue-refs>"
```

(If the request was ambiguous and `-a` was NOT passed, ask the one-line plan/build confirm first — see Strategy Selection — then either escalate as above or take a fast path per the answer.)

**Fast paths (Axis 2 → ready to build):** invoke the single/multi skill directly.

```
Skill tool: skill="x-as-pr", args="<flags> <instructions>"
# or
Skill tool: skill="x-wt-teams", args="<flags> <instructions>"
```

Pass through ALL arguments (flags + instructions) to the chosen skill (`-a`, `-m`, `-f`/`-nf`, and `-ri`/`-nori` included — they're forwarded on every route; the defaults `-f`/`-ri` need no forwarding when not explicitly typed).

## Important Notes

- This is a thin router — all implementation logic lives in `/x-as-pr` and `/x-wt-teams`; all planning logic lives in `/big-plan`
- Two axes: plan-first vs implement-now (escalate to `/big-plan -a` when research/decomposition/unclear scope), then single vs multi on the fast paths. `/big-plan` keeps the single/multi decision downstream — never duplicate it here
- When in doubt between single and multi on a ready-to-build task, choose `/x-as-pr` — it's simpler and the user can always re-run. When in doubt between plan and build, ask the one-line confirm (unless `-a`)
- Tell the user which strategy was chosen: "Routing to `/x-as-pr`", "Routing to `/x-wt-teams`", or "Escalating to `/big-plan -a` (needs planning first)"
- **Issue claim is inherited** — when an existing issue (including epic issues) is passed, the chosen downstream skill posts a claim comment on the issue immediately after reading it, so concurrent Claude Code sessions don't start parallel work on the same topic. No extra work is needed at the facade level.
