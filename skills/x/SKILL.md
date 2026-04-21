---
name: x
description: "Facade for development workflows. Routes to /x-as-pr (single-topic) or /x-wt-teams (multi-topic parallel). Use when: (1) User says '/x' followed by development instructions, (2) User wants to start development without deciding between /x-as-pr and /x-wt-teams, (3) User says 'dev', 'implement', or 'build' with a task description. Examines the request and chooses the right strategy. Default options: -l -v (review-loop + verify-ui)."
argument-hint: "[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-a|--auto] [-s|--stay] [options] <instructions>"
---

# X — Development Workflow Facade

Route development requests to the right workflow skill: `/x-as-pr` (single-topic) or `/x-wt-teams` (multi-topic parallel).

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

- **All flags from both skills** (`-haiku`, `--haiku`, `-so`, `--sonnet`, `-op`, `--opus`, `--make-issue`, `--issue`, `-s`, `--stay`, `-l`, `--review-loop`, `-v`, `--verify-ui`, `--noi`, `--no-issue`, `-co`, `--codex`, `-gco`, `--github-copilot`, `-gcoc`, `--github-copilot-cheap`, `-a`, `--auto`, etc.)
- **GitHub issue URL or number**
- **Implementation instructions** (remaining text)

### Default Options

If NO flags are passed (just instructions or an issue), apply these defaults:

- `-l` (review-loop)
- `-v` (verify-ui)

If any flags ARE passed explicitly, use those as-is — do NOT add defaults.

### Claude Model Mode (`-haiku` / `-so` / `-op`)

When a model flag is passed, forward it to the chosen skill. It controls the Claude model used for Claude subagents (child worktree agents in `/x-wt-teams`, fix-delegation agents in `/x-as-pr`, and the Claude-side reviewers inside `/deep-review`/`/review-loop`). **Default: `-op` (Opus)** when no model flag is passed. Orthogonal to `-co` / `-gco` / `-gcoc` — they can coexist. See the target skill for details.

### Codex Mode (`-co` / `--codex`)

When `-co` or `--codex` is passed, forward it to the chosen skill. This switches reviews, doc writing, and research to use codex-based alternatives (`/codex-review`, `/codex-writer`, `/codex-research`). See `/x-as-pr` and `/x-wt-teams` for details.

### GitHub Copilot Mode (`-gco` / `--github-copilot`)

When `-gco` or `--github-copilot` is passed, forward it to the chosen skill. This switches reviews and research to use GitHub Copilot CLI (`/gco`). Mutually exclusive with `-co` and `-gcoc`. See `/x-as-pr` and `/x-wt-teams` for details.

### GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

When `-gcoc` or `--github-copilot-cheap` is passed, forward it to the chosen skill. Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). Switches reviews and research to use `/gcoc-*` variants. Mutually exclusive with `-co` and `-gco`. See `/x-as-pr` and `/x-wt-teams` for details.

### Auto-Complete Mode (`-a` / `--auto`)

When `-a` or `--auto` is passed, forward it to the chosen skill. After the workflow completes, it automatically runs `/pr-complete -c -w` to merge the PR, close the linked issue, and watch post-merge CI. Intended for full-auto, safe-to-merge work.

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
