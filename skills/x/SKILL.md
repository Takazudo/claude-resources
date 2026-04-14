---
name: x
description: >-
  Facade for development workflows. Routes to /x-as-pr (single-topic) or /x-wt-teams (multi-topic
  parallel). Use when: (1) User says '/x' followed by development instructions, (2) User wants to
  start development without deciding between /x-as-pr and /x-wt-teams, (3) User says 'dev',
  'implement', or 'build' with a task description. Examines the request and chooses the right
  strategy. Default options: -l -v (review-loop + verify-ui).
argument-hint: "[-co|--codex] [-gco|--github-copilot] [-a|--auto] [options] <instructions>"
---

# X — Development Workflow Facade

Route development requests to the right workflow skill: `/x-as-pr` (single-topic) or `/x-wt-teams` (multi-topic parallel).

## Input Parsing

Parse `$ARGUMENTS` for:

- **All flags from both skills** (`--make-issue`, `--issue`, `--stay`, `-l`, `--review-loop`, `-v`, `--verify-ui`, `--noi`, `--no-issue`, `-co`, `--codex`, `-a`, `--auto`, etc.)
- **GitHub issue URL or number**
- **Implementation instructions** (remaining text)

### Default Options

If NO flags are passed (just instructions or an issue), apply these defaults:

- `-l` (review-loop)
- `-v` (verify-ui)

If any flags ARE passed explicitly, use those as-is — do NOT add defaults.

### Codex Mode (`-co` / `--codex`)

When `-co` or `--codex` is passed, forward it to the chosen skill. This switches reviews, doc writing, and research to use codex-based alternatives (`/codex-review`, `/codex-writer`, `/codex-research`). See `/x-as-pr` and `/x-wt-teams` for details.

### GitHub Copilot Mode (`-gco` / `--github-copilot`)

When `-gco` or `--github-copilot` is passed, forward it to the chosen skill. This switches reviews and research to use GitHub Copilot CLI (`/gco`). Mutually exclusive with `-co`. See `/x-as-pr` and `/x-wt-teams` for details.

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
