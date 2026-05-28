---
name: x
description: "Facade for development workflows. Routes to /x-as-pr (single-topic) or /x-wt-teams (multi-topic parallel). Use when: (1) User says '/x' followed by dev instructions, (2) User wants to start development without choosing between /x-as-pr and /x-wt-teams, (3) User says 'dev', 'implement', or 'build' with a task. Default option: -v (verify-ui). Review-loop (-l) is opt-in — without -l the downstream skill runs a single /deep-review pass."
argument-hint: "[-op|-so|-haiku] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-t-op|--team-opus] [-t-so|--team-sonnet] [-a|--auto] [-s|--stay] [-nor|--no-review] [-ri|--raise-issues] [-nori|--no-raise-issues] [options] <instructions>"
---

# X — Development Workflow Facade

Route development requests to the right workflow skill: `/x-as-pr` (single-topic) or `/x-wt-teams` (multi-topic parallel).

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

- **All flags from both skills** (`-op`, `--opus`, `-so`, `--sonnet`, `-haiku`, `--haiku`, `-co`, `--codex`, `-gco`, `--github-copilot`, `-gcoc`, `--github-copilot-cheap`, `-t-op`, `--team-opus`, `-t-so`, `--team-sonnet`, `--make-issue`, `--issue`, `-s`, `--stay`, `-l`, `--review-loop`, `-v`, `--verify-ui`, `-nor`, `--no-review`, `--noi`, `-ri`, `--raise-issues`, `-nori`, `--no-raise-issues`, `--no-issue`, `-a`, `--auto`, etc.)
- **GitHub issue URL or number**
- **Implementation instructions** (remaining text)

### Default Options

If NO flags are passed (just instructions or an issue), apply this default:

- `-v` (verify-ui)

Review-loop (`-l`) is **NOT** added by default — for most tasks a single `/deep-review` pass is enough and the 5-round loop is overkill. The user must pass `-l` explicitly to opt in.

If any flags ARE passed explicitly, use those as-is — do NOT add the `-v` default either.

### Reviewer flags

`-op` / `-so` / `-haiku` and `-co` / `-gco` / `-gcoc` are **reviewer flags** — they change which reviewer(s) run, not subagents or team members. Forward them all to the chosen skill.

- `-op` / `-so` / `-haiku` — Claude reviewer model for `/deep-review` / `/review-loop`. Pick at most one.
- `-co` / `--codex` — add codex reviewer (`/codex-review`) plus codex writer / research.
- `-gco` / `--github-copilot` — add GitHub Copilot CLI reviewer (`/gco-review`) plus copilot 2nd opinion / research.
- `-gcoc` / `--github-copilot-cheap` — like `-gco` but forces the free `gpt-4.1` model.

All reviewer flags **combine** — passing multiple means run every selected reviewer. **Default when no reviewer flag is passed at all**: `/deep-review` at Opus. See the target skill for substitution tables.

### Team-member flags (`-t-op` / `-t-so`)

`-t-op` / `--team-opus` and `-t-so` / `--team-sonnet` override the model used by spawned subagents and agent-team members (child worktree agents in `/x-wt-teams`, fix-delegation agents in `/x-as-pr`). Pick at most one. **Default: `opus`.** No `-t-haiku`. Forward to the chosen skill.

These do NOT affect reviewers and are orthogonal to all reviewer flags.

### Auto-Complete Mode (`-a` / `--auto`)

When `-a` or `--auto` is passed, forward it to the chosen skill. After the workflow completes, it automatically runs `/pr-complete -c -w` to merge the PR, close the linked issue, and watch post-merge CI. Intended for full-auto, safe-to-merge work.

### No Review Mode (`-nor` / `--no-review`)

When `-nor` or `--no-review` is passed, forward it to the chosen skill. The downstream skill skips the post-implementation review step entirely (no `/deep-review`, no `/review-loop`, no fix-delegation Agent) and goes straight from implementation to push / CI watch / PR revision. Use when the task is throwaway or you've already reviewed the changes yourself.

### Raise-Issues Mode (`-ri` / `--raise-issues`, default — and `-nori` / `--no-raise-issues` to suppress)

By default the downstream skill raises GitHub issues (labeled `agent-found`) for problems, bugs, or improvement possibilities found in code unrelated to the current task. `-ri` / `--raise-issues` is the explicit form of the default. Pass `-nori` / `--no-raise-issues` to suppress.

Forward whichever flag was on the invocation to the chosen skill. If neither was passed, no forwarding is needed — the downstream default already raises issues.

## Strategy Selection

Analyze the request to decide which skill to invoke:

### Use `/x-wt-teams` when

- The task clearly involves **multiple independent topics** that can be worked on in parallel
- Keywords: "multiple", "several", "split into", "parallel", "topics", "worktree"
- The instructions contain a list of distinct features/changes (3+ items)
- The user explicitly asks for parallel development

### Use `/x-as-pr` when

- The task is a **single cohesive feature** or fix
- The task is small to medium scope
- The instructions describe one thing to do
- The user passes an issue URL/number and it is NOT an epic issue (see below)
- Ambiguous cases — prefer `/x-as-pr` as the simpler option

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
| "add pagination to the user list" | `/x-as-pr` | Single feature |
| "fix the login bug #42" | `/x-as-pr` | Single fix |
| "implement dark mode, add search, update footer" | `/x-wt-teams` | 3 independent topics |
| "refactor the auth system" | `/x-as-pr` | One cohesive refactor |
| "build the settings page with theme picker, notification prefs, and profile editor" | `/x-wt-teams` | 3 parallel-able sections |
| `https://github.com/owner/repo/issues/42` | `/x-as-pr` | Single issue |
| `https://github.com/owner/repo/issues/42` (title has `[Epic]`) | `/x-wt-teams` | Epic issue from `/big-plan` |

## Execution

Once the strategy is chosen, invoke the appropriate skill:

```
Skill tool: skill="x-as-pr", args="<flags> <instructions>"
# or
Skill tool: skill="x-wt-teams", args="<flags> <instructions>"
```

Pass through ALL arguments (flags + instructions) to the chosen skill.

## Important Notes

- This is a thin router — all logic lives in `/x-as-pr` and `/x-wt-teams`
- When in doubt, choose `/x-as-pr` — it's simpler and the user can always re-run with `/x-wt-teams`
- Tell the user which strategy was chosen: "Routing to `/x-as-pr`" or "Routing to `/x-wt-teams`"
- **Issue claim is inherited** — when an existing issue (including epic issues) is passed, the chosen downstream skill posts a claim comment on the issue immediately after reading it, so concurrent Claude Code sessions don't start parallel work on the same topic. No extra work is needed at the facade level.
