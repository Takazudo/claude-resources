---
name: x-wt-teams
description: "Parallel multi-topic development using git worktrees with a base branch strategy and Claude Code agent teams. Use when: (1) User wants to work on multiple related features in parallel, (2) User mentions 'worktree', 'base branch', or 'parallel development', (3) User says 'split into topics' or 'multi-topic development'. This skill is FULLY AUTONOMOUS — it creates worktrees, spawns agent teams, and coordinates everything automatically. No manual child sessions needed. Also supports **Super-Epic child mode** — when given an `[Epic]` issue (created by `/big-plan` in Super-Epic mode) whose body contains `**Super-epic:** #N` markers, the session targets the super-epic base branch instead of main/invocation branch, producing an epic-PR that merges into the super-epic base."
argument-hint: "[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-a|--auto] [--no-issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui] [-nor|--no-review] [--noi] [-noi|--no-raise-issues] [#issue-number] <instructions>"
---

# Git Worktree Multi-Topic Development

Coordinate parallel development of multiple related features using git worktrees, a shared base branch, and Claude Code agent teams. **This is fully automated** — you (the manager) create the infrastructure and spawn child agents to do the work. Never ask the user to manually start sessions in worktrees.

## !! CRITICAL — ROOT PR TARGET BRANCH RULE !!

**The root PR's base MUST be the current (invocation) branch, NOT the repository's default branch.**

As the very first action, record the current branch:

```bash
INVOCATION_BRANCH=$(git branch --show-current)
```

The root PR's `--base` MUST be `$INVOCATION_BRANCH` (or a user-specified parent branch) — NEVER omit `--base` on `gh pr create`, because `gh` defaults to the repo's default branch (usually `main`), which is almost always wrong here.

**Concrete example (this is the bug this rule prevents):**

```
Current branch: topic/foo-bar
User runs:      /x-wt-teams do blah blah...
CORRECT:        base/moo-mew → root PR targets topic/foo-bar
WRONG:          base/moo-mew → root PR targets main   ← DO NOT DO THIS
```

This applies regardless of:

- Whether the current branch already has a PR
- Whether the current branch has commits ahead of main
- Whether `main` "seems more natural" as the base
- Whether the current branch looks like a work-in-progress topic

The only exceptions are (a) the user explicitly specifies a different parent branch, or (b) this is a Super-Epic child session (see Step 1a — parent branch is fixed to the super-epic base). Both are explicit, never inferred.

(See Step 2 "Create Base Branch and Root PR" for the full mechanism.)

## Auto-Pilot Behavior (Always On)

This skill orchestrates long-running autonomous parallel work (worktrees, agent teams, issue tracking, reviews, merges). When invoked, behave as if Auto Mode is active — regardless of session mode:

1. **Execute immediately** — start implementing right away. Make reasonable assumptions and proceed on low-risk work.
2. **Minimize interruptions** — prefer making reasonable assumptions over asking questions for routine decisions.
3. **Prefer action over planning** — do not enter plan mode unless the user explicitly asks. When in doubt, start coding.
4. **Expect course corrections** — treat mid-run user input as normal corrections, not failures.
5. **Do not take overly destructive actions** — deleting data, force-pushing, or modifying shared/production systems still needs explicit confirmation.
6. **Avoid data exfiltration** — do not post to external platforms or share secrets unless the user has authorized that specific destination.

These rules apply to the manager session and are carried into child agent prompts so worktree teammates also operate in auto-pilot.

## Playwright / Browser Verification — Isolated Subagent Only

**HARD RULE**: Neither the manager nor any child agent may invoke `/headless-browser`, `/verify-ui`, or any other Playwright / Chrome DevTools-backed tool **directly**. Multiple concurrent browser-automation sessions (one per child worktree × N topics) will freeze the machine and burn huge token budgets.

**Why**: Playwright/Chrome DevTools each launch a real browser process. With up to 6 concurrent child agents (see Step 5 concurrency cap), 6 simultaneous Chromium instances + their token-heavy trace/snapshot output overwhelms the local machine. Playwright tool calls also return large DOM/accessibility snapshots that balloon context windows fast.

**The rule**:

1. **Child agents**: NEVER invoke `/headless-browser` or `/verify-ui` directly. If a topic needs browser-based verification, the child agent commits its code and **reports back to the manager** that a browser check is requested (include the URL, what to check, and which selectors matter). The child does NOT run the check itself.
2. **Manager**: Also NEVER invokes `/headless-browser` or `/verify-ui` in its own context. Instead, spawn a **fresh dedicated Opus subagent** via the Agent tool, let that subagent run the browser tool, collect its result, and **kill the subagent immediately after** the single confirmation returns.
3. **One at a time, sequential only**: At most **one** browser-verification subagent may be alive across the entire workflow. Never spawn two in parallel — even if two topics want a UI check, queue them and run sequentially.
4. **Kill after each confirmation**: After the subagent returns its result, do not keep it alive for follow-up checks. Each verification gets its own fresh subagent. This prevents the Playwright/DevTools context from accumulating tokens across checks.

**How to dispatch a browser-verification subagent:**

```
Agent tool:
  description: "UI verification via Playwright"
  subagent_type: "general-purpose"
  model: "opus"
  prompt: "You are a disposable UI-verification subagent for the /x-wt-teams workflow.
           Target URL: <url>
           Branch under test: base/<project-name>
           What to verify: <specific checks — e.g., 'confirm .sidebar width is 240px', 'screenshot the /settings page and confirm the new toggle is visible'>

           Use /verify-ui (for computed-style checks) or /headless-browser (for screenshots / interactions), whichever fits.
           Return a concise PASS/FAIL report with evidence (computed values, screenshot path, or error excerpt).
           Do NOT attempt to fix any issues you find — only report them. The manager will dispatch fixes separately.

           Keep the report under 200 words."
```

After the Agent call returns, the subagent is automatically torn down. Do not re-use it — spawn a new one for the next verification.

**Applies to all browser tooling**: `/verify-ui`, `/headless-browser`, any Playwright MCP, any Chrome DevTools MCP, and any future tool that launches a real browser. When in doubt, route through the isolated subagent.

## Port-Based Servers & Heavy Local Tests — Resource Coordination

Parallel child worktrees can fight over the same port (multiple `pnpm dev` on :3000) or thrash the CPU (heavy integration suites running concurrently). Two rules prevent this.

### Rule 1 — Defer heavy & port-binding tests to the manager

Child agents must NOT run:

- Full e2e / integration test suites that bind ports or spawn servers
- Playwright / browser-based tests (already covered above)
- Long-running build-and-test cycles (`pnpm build` + full test run, production server boots, etc.)
- Any `pnpm dev` / `npm run dev` / `vite` / similar dev-server process held open for verification

Instead, the child:

1. Commits its code locally (per the push-forbid rule)
2. Reports back to the manager with: "integration check needed — URL/endpoint, what to verify, branch name"
3. Manager runs these sequentially on the merged base branch after Step 6. The natural homes are Step 9 (quality assurance on the base) and, for UI-specific checks, Step 10 (`/verify-ui` via the isolated browser subagent pattern)

Child agents CAN run: unit tests, type-check, lint, component tests, and anything that does NOT bind a port. These are fast and do not conflict across worktrees.

### Rule 2 — `flock` serialization for legitimate short port work

If a child genuinely must bind a port during implementation (e.g., 10-second smoke test of a new API route), serialize across worktrees with `flock`. All worktrees share the host filesystem, so one lock file per port is sufficient. This is the escape hatch, NOT the default — prefer Rule 1.

**Pattern** (child agents use this in their bash scripts):

```bash
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
LOCK_DIR="/tmp/x-wt-teams-${REPO_NAME}-locks"
mkdir -p "$LOCK_DIR"
(
  flock -w 600 9 || { echo "port lock timeout after 600s"; exit 1; }
  PORT=3000 pnpm dev &
  SERVER_PID=$!
  # ... quick check (under a minute) ...
  kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
) 9>"$LOCK_DIR/port-3000.lock"
```

**Rules for child agents using `flock`:**

- Hold the lock for the shortest possible time (start → check → stop → release)
- ALWAYS kill the server inside the locked block — a zombie server steals the port from the next waiter
- Never hold a lock across a > 5-minute operation; redesign the check if it takes longer
- One lock file per port number (e.g., `port-3000.lock`, `port-5173.lock`) — do NOT share one file for multiple ports
- `flock` releases automatically on subshell exit (including on process kill), so stale locks are self-healing

**Manager responsibility:**

- Lock files live under `/tmp/x-wt-teams-<repo-name>-locks/` — outside the repo, no `.gitignore` concern
- When the workflow ends or aborts, the locks clear themselves (flock on subshell exit). No manual cleanup required
- If a child reports a port-lock timeout (600s exceeded), that means another child held the port too long — treat as a bug in that child's logic, not a resource-contention fact of life

**Decision rule:** if you're reaching for `flock`, first ask: "Could I defer this to the manager instead?" If yes, do that (Rule 1). `flock` is only for cases where the check genuinely must run in the child context during implementation.

## SendMessage Content — No Markdown Code Spans (Ink Crash Workaround)

**HARD RULE**: Every `SendMessage` tool call — manager → child, child → manager, or peer → peer — MUST use plain prose in the `message` content. No backticks, no triple-backtick code fences, no inline markdown code formatting of any kind. Reference file paths, function names, shell commands, and identifiers as unquoted words.

**Why**: Claude Code v2.1.117 has an unfixed Ink rendering bug ([anthropics/claude-code#51855](https://github.com/anthropics/claude-code/issues/51855)). When a teammate's message contains inline code spans, Claude Code's `※ recap:` summary line crashes with `<Box> can't be nested inside <Text>` at `createInstance` (`cli.js:495:249`). The crashed pane then tears down the whole `~/.claude/teams/<name>/` directory, cascading to all other teammates. In a 6-way parallel workflow, one stray backtick in one message can kill the entire run. Receive-side stalls have also been observed, so the rule applies in both directions.

**Examples:**

- Bad: "Committed the fix to `src/api.ts` — run `pnpm test` to verify"
- Good: "Committed the fix to src/api.ts — run pnpm test to verify"
- Bad: triple-backtick fenced diff or code block inside the message
- Good: "See the log file at {logdir}/… for the diff"

**Scope**: Applies ONLY to `SendMessage` tool calls. Markdown (including backticks and code fences) is still fine everywhere else — commits, PR bodies, issue comments, log files, TaskCreate descriptions, source code. When the upstream bug is fixed, revisit and drop this workaround.

## GitHub Issue Tracking (Default)

By default, create a GitHub issue at the start to track progress. The manager and child agents comment on this issue at the end of each step, providing a running log of progress.

- **`--no-issue`**: Skip issue creation. Also skip if the user explicitly says not to create an issue.
- **`-s` or `--stay`**: **(OPT-IN ONLY — never auto-detect)** Use the current branch as the base branch instead of creating a new one. See "Using `--stay`" below. **Only apply when the user explicitly passes `-s` or `--stay`.** Even if the current branch has an existing PR, even if it "seems logical" to stay — ALWAYS create a new branch unless `-s` / `--stay` was literally typed by the user.
- **`-l` or `--review-loop`**: Replace the Step 9 deep review with `/review-loop 5 --aggressive` instead of `/deep-review`. By default, this also passes `--issues` to create GitHub issues for considerable review findings. See "Review Loop Mode" below.
- **`--no-review` or `-nor`**: Skip Step 9 (Quality Assurance) entirely. **Used internally by `/deep-review -t`** when it spawns this skill to apply review fixes — without this flag, the inner session would call `/deep-review` again (which defaults back to `-t`), causing infinite recursion. Manual users may also pass this flag to opt out of the final review pass and just do the implementation.
- **`-v` or `--verify-ui`**: After review fixes (Step 9), run `/verify-ui` to verify frontend/CSS/layout changes visually. See "Verify UI Mode" below.
- **`--noi`, `--noissue`, or `--noissues`**: Only meaningful with `--review-loop`. Suppresses `--issues` flag on the review-loop invocation, so no GitHub issues are created for review findings.
- **`-noi` or `--no-raise-issues`**: Suppress raising GitHub issues for unrelated problems found during coding or reviewing. See "Raising Issues for Unrelated Findings" below.
- **`-co` or `--codex`**: Use codex-based alternatives for reviews, doc writing, and research. See "Codex Mode" below. Can be combined with `-gco` and/or `-gcoc` — see "Combined Reviewer Mode" below.
- **`-gco` or `--github-copilot`**: Use GitHub Copilot CLI for reviews and research. See "GitHub Copilot Mode" below. Can be combined with `-co` and/or `-gcoc` — see "Combined Reviewer Mode" below.
- **`-gcoc` or `--github-copilot-cheap`**: Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). See "GitHub Copilot Cheap Mode" below. Can be combined with `-co` and/or `-gco` — see "Combined Reviewer Mode" below.
- **`-a` or `--auto`**: After the workflow completes (Step 15), automatically run `/pr-complete -c -w` to merge the PR, close the linked issue, and watch post-merge CI. Intended for full-auto, safe-to-merge work. **Ignored in Super-Epic child mode** — the epic-PR → super-epic base merge is already mandatory there, and `-a` does NOT escalate further to merge the super-epic base into main. Do not pass `-a` for Super-Epic sessions; if it is passed, treat it as a no-op and proceed with the mandatory merge step.
- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Claude model used for **child worktree agents** (Step 5) and for Claude-based reviewers in the manager's 2nd-opinion / confirmation / final `/deep-review` steps. Pick at most one. **Default: `-op` (Opus).** **Manager invariant**: the manager session itself ALWAYS runs as Opus regardless of this flag — if the user is on a non-Opus session, note it but proceed. See "Manager invariant & model delegation" below.
- **Existing issue provided**: If the user provides an existing issue (number or URL), read it first with `gh issue view <number>`. The issue body typically contains implementation instructions or a prompt — use it as the primary input for planning topics and development. Reuse this issue for progress logging instead of creating a new one.
- The issue number is passed to all child agents so they can comment on it too.
- Comments should be concise step reports (what was done, outcome, any issues encountered).

### Using `-s` / `--stay` (Opt-In Only)

When `-s` or `--stay` is **explicitly passed by the user**, the current branch is reused as the base branch — no new `base/<project-name>` branch is created. This avoids deep nesting when running `/x-wt-teams` multiple times in sequence.

**Typical scenario:**

1. First round: `/x-wt-teams` creates `base/foo-impl` → `main`, work is done, PR merged
2. Need more tweaks — you're still on `base/foo-impl`
3. Without `--stay`: creates `base/foo-impl-v2` → `base/foo-impl` → `main` (too nested)
4. With `--stay`: reuses `base/foo-impl` as the base, topics branch off it, root PR targets `main`

**How it works:**

- The current branch becomes `BASE_BRANCH` directly (no new branch, no empty commit)
- The parent branch (for the root PR target) is determined by:
  1. Checking if a PR already exists for this branch: `gh pr view --json baseRefName -q '.baseRefName'`
  2. If yes, reuse that PR (record its number) and use its base as the parent branch
  3. If no PR exists, use the repository's default branch as the parent and create a new root PR
- Topics branch off `BASE_BRANCH` and merge back into it as usual
- Everything else (worktrees, child agents, review, push) works the same

**CRITICAL**: `-s` / `--stay` is NEVER auto-detected. Do NOT decide to use `--stay` behavior just because the current branch already has a PR or because it "makes sense." The user must explicitly type `-s` or `--stay`. Without it, ALWAYS create a new branch — even if you're on `topic/foo` with an existing PR targeting `main`. The new base branch will target `topic/foo`, producing a clean diff for just this session's work.

## Architecture

```
<parent-branch> (the branch you branch from — could be main, develop, or a feature branch)
  └── base/<project-name>  (base branch, created by manager)
        ├── <project-name>/topicA  (child branch → PR into base)
        ├── <project-name>/topicB  (child branch → PR into base)
        └── <project-name>/topicC  (child branch → PR into base)

worktrees/
  ├── <topicA>/  (worktree for topicA, child agent works here)
  ├── <topicB>/  (worktree for topicB, child agent works here)
  └── <topicC>/  (worktree for topicC, child agent works here)
```

Each topic gets its own worktree directory, its own branch, and its own PR targeting the base branch. The manager merges topic PRs into the base branch, then creates one root PR from base into the parent branch.

**Super-Epic child variant** — when the input is an epic issue from `/big-plan` Super-Epic mode (see "Super-Epic child mode" in Step 1a), `<parent-branch>` is fixed to the super-epic base `base/<super-title>`, and `<project-name>` equals `<super-title>-<epic-slug>`. The root PR becomes the epic-PR and targets the super-epic base rather than main. Everything below that (topics, worktrees, merge flow) is identical.

## PR Body Reference Header

When creating any PR (`gh pr create`), check for parent references and prepend a header to the PR body. This identifies what the PR belongs to.

**For the root PR (Step 2):**

1. **Parent issue**: Use `ISSUE_NUMBER` if set
2. **Parent PR**: Check if the parent branch has an open PR:

   ```bash
   PARENT_PR_NUM=$(gh pr list --head "$PARENT_BRANCH" --json number -q '.[0].number' 2>/dev/null)
   ```

   (When using `--stay`, check for a parent PR on `PARENT_BRANCH`, not the current branch itself.)

**For topic PRs (Step 11):**

1. **Parent issue**: Use `ISSUE_NUMBER` if set
2. **Parent PR**: Use the root PR number

**Header format** — prepend to the very start of the PR body (before `## Summary`):

```markdown
- issues
    - <REPO_URL>/issues/<ISSUE_NUMBER>
- parent PR
    - <REPO_URL>/pull/<PARENT_PR_NUM>

---

```

- Use `gh repo view --json url -q '.url'` to get `REPO_URL`
- Only include sections that have values — omit `- issues` if no issue, omit `- parent PR` if no parent PR
- If neither exists, omit the header entirely
- **When updating the PR body later** (e.g., via `/pr-revise`), always preserve the reference header at the top — do not remove or replace it

## Fully Automated Workflow

**IMPORTANT**: You are the manager. You handle ALL steps automatically:

1. Resolve GitHub tracking issue (read existing, create new, or skip)
2. Create base branch + root PR
3. Create worktrees for each topic
4. Set up environment in worktrees
5. Use TeamCreate + Task tool to spawn child agents in worktrees (NO pushing during implementation — commit only)
6. Monitor child agents, review their PRs, merge into base
7. Shut down child agents — close tmux panes, TeamDelete
8. Sync local base branch
9. Quality assurance: `/deep-review` (default) or `/review-loop 5 --aggressive` (if `-l`/`--review-loop`)
10. Verify UI: `/verify-ui` (if `-v`/`--verify-ui`)
11. Push all changes to remote
12. CI watch: verify CI passes on root PR (invoke `/watch-ci`, fix if red)
13. Update root PR and mark ready
14. Session report
15. Requirements verification (if issue linked) — **STOP HERE. Workflow ends.**
16. _(DEFERRED — only when user asks, after PR is merged)_ Clean up worktrees and branches

**PUSH-FORBID DURING WORK**: To save CI resources, child agents must **NOT push** during implementation. They commit locally only. All pushing happens in Step 11 after deep review is complete. This prevents CI from running on every intermediate commit.

**Never ask the user to manually cd into worktrees or start Claude sessions.** Use the Task tool to spawn agents that work in each worktree directory.

### Step 1: Resolve GitHub Tracking Issue

There are three modes depending on user input:

#### 1a: Existing issue provided

If the user provides an existing issue number or URL, **read it first** — it usually contains implementation instructions or a prompt:

```bash
gh issue view <number>
```

Use the issue body as the primary input for planning topics and the development approach. Set `ISSUE_NUMBER=<number>` and reuse this issue for progress logging (no new issue needed).

**Epic issue shortcut (created by `/big-plan`):** If the issue title contains `[Epic]`, the planning is already done. Extract directly from the issue body:

- **Topics** — use the child sub-issues listed in the issue (each `[Sub]` issue becomes one topic)
- **Base branch** — use the `base/...` name stated in the issue body (do NOT invent a new one)
- **Dependency order** — respect the dependency graph in the issue body; start with independent topics first

Do NOT re-plan or re-analyze the codebase. Do NOT update the epic issue body (it already has a complete spec). Just proceed to Step 2 with the extracted topics and base branch name.

**Claim the epic issue:** Before Step 2, post a claim comment on the epic issue so other Claude Code sessions don't start parallel work on the same epic:

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\`). To avoid conflicts, please check the latest comments before starting another session on this epic."
```

**Super-Epic child mode** — when the `[Epic]` issue body contains these three markers (the literal spellings matter; `/big-plan` Super-Epic mode writes them):

```
**Super-epic:** #<super-epic-issue-number>
**Super-epic base branch:** `base/<super-title-slug>`
**This epic's base branch:** `base/<super-title-slug>-<epic-slug>`
```

Then this session is a Super-Epic child. Handle it like the normal epic shortcut with these overrides:

1. **Parent branch** = super-epic base branch from the marker (NOT main, NOT the invocation branch, NOT `--stay`). Treat as if the user explicitly passed this base.
2. **Base branch** = the value in `**This epic's base branch:**`. Use it verbatim in Step 2 (`git checkout -b <that-name>`). Do not invent a project name.
3. **Project name (topic-branch prefix)** = the epic base slug (everything after `base/`), so topic branches become `{super-title-slug}-{epic-slug}/<topic>`.
4. **Topics** — this epic's body lists sub-tasks inline (not as separate `[Sub]` issues). Each inline sub-task becomes one topic.
5. **Super-epic base must already exist** — `/big-plan` Super-Epic mode creates it at S-9. Defensively verify before proceeding:

   ```bash
   git fetch origin
   git show-ref --verify --quiet refs/remotes/origin/base/<super-title-slug> || {
     echo "Super-epic base 'base/<super-title-slug>' does not exist on origin."
     echo "Re-run /big-plan Super-Epic mode (S-9) or create the super-epic anchor manually."
     exit 1
   }
   ```

6. **Root PR** (Step 2) **targets the super-epic base branch** (`--base base/<super-title-slug>`), not main. This makes the epic-PR a child of the super-PR.
7. **Do NOT close the super-epic issue** at the end of this session. Only comment on it with a link to the merged epic-PR. The super-epic stays open until all its sibling epic PRs are merged.
8. **Session scope is one epic only, AND the epic-PR MUST be merged before STOP** — do not leave the epic-PR open for the user to merge later. The merge is handled by the mandatory "Super-Epic: Merge Epic-PR into Super-Epic Base" step before STOP. **`-a` / `--auto` is NOT required for this merge** and is ignored in Super-Epic child mode (it would be confusing — it could be misread as also merging the super-epic base into main, which this skill never does). After the merge, the workflow ends and the user runs `/x-wt-teams <next-epic-url>` in a fresh session for the next epic. At session end, the manager auto-suggests the next epic URL (see "Auto-Suggest Next Command" before STOP). Skipping the merge breaks the multi-epic stacking strategy: the next epic would branch off a stale super-epic base, and sibling epic-PRs would collide.
9. **Capture the super-epic number for end-of-session hand-off:**

   ```bash
   # Extract the super-epic issue number from the marker line in this epic's body
   SUPER_EPIC_NUMBER=$(gh issue view "$ISSUE_NUMBER" --json body --jq .body \
     | grep -oE '\*\*Super-epic:\*\* #[0-9]+' | grep -oE '[0-9]+' | head -1)
   ```

   Keep `SUPER_EPIC_NUMBER` around — it's used at session end to suggest the next epic.

Everything else (worktrees, child agents, review, push, CI watch, feedback loop) works the same as the normal epic shortcut.

**Claim the epic issue (Super-Epic child):** After extracting topics and verifying the super-epic base, post a claim comment on **this epic's issue** (not the super-epic issue — sibling epics run in parallel in other sessions):

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\` Super-Epic child). To avoid conflicts, please check the latest comments before starting another session on this epic."
```

**For non-epic issues:** Update the issue body with `gh issue edit` to add:

1. A **Summary** section (if missing) — write 2-4 sentences explaining what this implementation does and why, based on the user's instructions and your planned approach
2. A **Topics** section listing each topic with a 1-sentence description
3. A **TODO checklist** of workflow steps (same as in 1b)

This ensures the issue serves as a spec tracker that clearly communicates the implementation scope.

**Claim the issue (non-epic):** Before Step 2, post a claim comment so other Claude Code sessions don't start parallel work on the same topic:

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this issue in a Claude Code session (\`/x-wt-teams\`). To avoid conflicts, please check the latest comments before starting another session on this issue."
```

#### 1b: Create new issue (default)

Unless `--no-issue` is passed or the user explicitly says not to create an issue, create a new GitHub issue to track progress. **The issue serves as a spec tracker** — it should clearly communicate what is being implemented and why, not just log steps.

**Before creating the issue**, analyze the user's instructions and plan the topics. Then write a concise but informative summary that answers: "What are we doing and why?" This summary should be enough for someone unfamiliar with the task to understand the scope. Not too detailed (that's for the PR), not too brief (that's useless).

```bash
ISSUE_URL=$(gh issue create \
  --title "<project-name>: <concise description of what's being done>" \
  --body "$(cat <<'EOF'
## Summary

<2-4 sentences explaining what this implementation does and why. What problem does it solve? What's the approach?>

### Topics

- **<topic-A>**: <1 sentence — what this topic covers>
- **<topic-B>**: <1 sentence — what this topic covers>

### TODO
- [ ] Step 1: Resolve GitHub tracking issue
- [ ] Step 2: Create base branch and root PR
- [ ] Step 3: Create worktrees
- [ ] Step 4: Environment setup
- [ ] Step 5: Spawn child agents (implementation)
- [ ] Step 6: Review and merge topic PRs
- [ ] Step 7: Shut down child agents
- [ ] Step 8: Sync local base branch
- [ ] Step 9: Quality assurance (deep review or review-loop)
- [ ] Step 10: Verify UI (if --verify-ui)
- [ ] Step 11: Push all changes to remote
- [ ] Step 12: CI watch (verify CI passes)
- [ ] Step 13: Update root PR and mark ready
- [ ] Step 14: Session report
- [ ] Step 15: Requirements verification (if issue linked)
- [ ] Step 16: Cleanup

### Progress Log
Comments below contain step-by-step progress reports.
EOF
)")
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
```

#### 1c: No issue (`--no-issue`)

Skip issue creation entirely. All `gh issue comment` calls throughout the workflow are skipped.

---

Save `ISSUE_NUMBER` (from 1a or 1b) — it will be passed to all child agents and used for progress comments throughout the workflow.

**Progress reporting pattern**: At the end of each subsequent step:

1. **Check off the completed step** in the issue body's TODO checklist (use `gh issue edit` to update the body, changing `- [ ]` to `- [x]` for the completed step)
2. **Comment** on the issue with a brief report:

   ```bash
   gh issue comment "$ISSUE_NUMBER" --body "$(cat <<'EOF'
   ### Step N: <step name> — completed

   <concise summary of what was done, outcome, any issues>
   EOF
   )"
   ```

3. **Re-read the issue** to check the TODO list and confirm what comes next:

```bash
gh issue view "$ISSUE_NUMBER"
```

This re-read step is **critical** — it prevents losing track of remaining steps during long workflows with many interactions. Always check the TODO list to determine "What's next?" before proceeding.

### Codex 2nd Opinion (Planning Phase)

**SKIP THIS SECTION ENTIRELY if the issue was created by `/big-plan`** (i.e., the issue title contains `[Epic]`, or this is a Super-Epic child session). `/big-plan` already runs a 2nd opinion on the plan during its own workflow, so the topics and decomposition have already been validated. Re-running it here is wasteful — proceed directly to Step 2.

For all other sessions (no issue, or a user-provided non-epic issue), after Step 1 and before Step 2, when the abstract concept of the task is understood and topics are planned:

1. **Form an initial plan** — list the topics, what each will implement, and the overall approach
2. **Invoke `/codex-2nd`** — send the plan to codex for a second opinion
3. **Review feedback** — if codex returns useful, actionable feedback (e.g., missing topics, better decomposition, risk areas), update the plan
4. **Optionally re-run** — if the plan changed significantly, invoke `/codex-2nd` again (up to 3 iterations total)
5. **Finalize and proceed** — once stable, continue to Step 2

This is advisory. If codex is unresponsive, proceed with the original plan.

---

### Manager invariant & model delegation

**The manager is ALWAYS Opus.** The manager session (this one) runs the full workflow at Opus, period. The model flags do NOT downgrade the manager. If the user is running this on a non-Opus session and passes e.g. `-so`, note it but proceed with what you have — the model flag still governs delegation below.

**Where the resolved model flag IS applied:**

1. **Child worktree agents** (Step 5) — every `Agent(...)` spawned for a topic gets `model:` set to the resolved Claude model (default `opus`).
2. **2nd-opinion / confirmation step** — if you are invoking a Claude-side 2nd opinion (not `/codex-2nd` / `/gco-2nd`), spawn the reviewer at the resolved model.
3. **Step 9 final quality assurance** — `/deep-review` (or `/review-loop`) is invoked with the same model/backend flags forwarded, so the Claude reviewers inside run at the resolved model.
4. **Child self-review** (Step 5) — child agents run `/light-review` with whatever backend flag was set (`-co` / `-gco` / `-gcoc`); if no backend flag, `/light-review` falls to its own default (`-gcoc`). The model flag does NOT force Claude reviewers here — the backend default owns that path. If you explicitly want Claude-model self-review, pass both a model flag AND omit backend flags in the child's `/light-review` invocation.

Model flags are **orthogonal** to `-co` / `-gco` / `-gcoc`. They can coexist. The backend flags (`-co`, `-gco`, `-gcoc`) can ALSO coexist with each other — passing multiple backend flags runs all their reviewers for improved quality coverage. See "Combined Reviewer Mode" below.

---

### Codex Mode (`-co` / `--codex`)

When `-co` or `--codex` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | Codex replacement | Used for |
|---|---|---|
| `/deep-review` | `/codex-review` | Step 9 quality assurance (manager review) |
| `/review-loop N --aggressive` | `/codex-review` (run once) | Review loop mode review step |
| `/light-review` in child agents (Step 5) | `/light-review -co` | Child agent self-review (`/light-review` routes to `/codex-review` under the hood) |
| Agent tool (web search, research) | `/codex-research` | Any web search or codebase research during planning/implementation |
| Agent tool (doc writing) | `/codex-writer` | Writing documentation, README, or other text content |

**How it affects the workflow:**

- **Step 5 (child agents)**: Child agents run `/light-review -co` for self-review. `/light-review` dispatches to `/codex-review`.
- **Step 9 (quality assurance)**: Instead of `/deep-review` or `/review-loop`, invoke `/codex-review`. If `-l`/`--review-loop` is also passed, still invoke `/codex-review` once (not multiple rounds — codex review is already thorough).
- **Research during planning**: When you need to research libraries, APIs, or best practices, prefer `/codex-research` over the Agent tool or WebSearch.
- **Documentation writing**: When writing README content, doc comments, or other prose, prefer `/codex-writer` over writing directly.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

### GitHub Copilot Mode (`-gco` / `--github-copilot`)

When `-gco` or `--github-copilot` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | GCO replacement | Used for |
|---|---|---|
| `/deep-review` | `/gco-review` | Step 9 quality assurance (manager review) |
| `/review-loop N --aggressive` | `/gco-review` (run once) | Review loop mode review step |
| `/light-review` in child agents (Step 5) | `/light-review -gco` | Child agent self-review (`/light-review` routes to `/gco-review` under the hood) |
| `/codex-2nd` (planning phase) | `/gco-2nd` | Second opinion on plans |
| Agent tool (web search, research) | `/gco-research` | Any web search or codebase research during planning/implementation |

**How it affects the workflow:**

- **Step 5 (child agents)**: Child agents use `/gco-review` for self-review. `/gco-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed.
- **Step 9 (quality assurance)**: Instead of `/deep-review` or `/review-loop`, invoke `/gco-review`. If `-l`/`--review-loop` is also passed, still invoke `/gco-review` once (not multiple rounds).
- **Second Opinion (planning phase)**: Instead of `/codex-2nd`, invoke `/gco-2nd`. If Copilot is rate-limited, `/gco-2nd` silently skips.
- **Research during planning**: When you need to research libraries, APIs, or best practices, prefer `/gco-research` over the Agent tool or WebSearch.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

### GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

Same as `-gco` / `--github-copilot` above, but forces the free `gpt-4.1` model (skips the Premium opus attempt). Use this when Premium quota is exhausted or when the task is simple enough that `gpt-4.1` feedback is sufficient. Can be combined with `-co` and/or `-gco` — see "Combined Reviewer Mode" below.

When `-gcoc` or `--github-copilot-cheap` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | GCOC replacement | Used for |
|---|---|---|
| `/deep-review` | `/gcoc-review` | Step 9 quality assurance (manager review) |
| `/review-loop N --aggressive` | `/gcoc-review` (run once) | Review loop mode review step |
| `/light-review` in child agents (Step 5) | `/light-review -gcoc` | Child agent self-review (`/light-review` routes to `/gcoc-review` under the hood) |
| `/codex-2nd` (planning phase) | `/gcoc-2nd` | Second opinion on plans |
| Agent tool (web search, research) | `/gcoc-research` | Any web search or codebase research during planning/implementation |

**How it affects the workflow:**

- **Step 5 (child agents)**: Child agents use `/gcoc-review` for self-review. Pass the `-gcoc` flag context so they select the cheap variant. `/gcoc-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed.
- **Step 9 (quality assurance)**: Instead of `/deep-review` or `/review-loop`, invoke `/gcoc-review`. If `-l`/`--review-loop` is also passed, still invoke `/gcoc-review` once (not multiple rounds).
- **Second Opinion (planning phase)**: Instead of `/codex-2nd`, invoke `/gcoc-2nd`. If Copilot is rate-limited, `/gcoc-2nd` silently skips.
- **Research during planning**: When you need to research libraries, APIs, or best practices, prefer `/gcoc-research` over the Agent tool or WebSearch.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

### Combined Reviewer Mode (multiple backend flags)

The backend flags `-co`, `-gco`, and `-gcoc` are **NOT mutually exclusive** — they can be freely combined. When the user passes more than one (e.g. `-co -gcoc -gco`), run **all** of the selected reviewer backends, not just one. Multiple independent reviewers from different backends catch different classes of issues, so combining them is an explicit quality-coverage choice by the user.

**Rule: if multiple backend flags are passed, run them all — never pick one and drop the others.** Do not treat this as redundant or "pick the best." The user is paying (in time, in quota) for multi-angle review on purpose.

**Which backends → which reviewers:**

| Flag present | Reviewer invoked | 2nd-opinion invoked | Child self-review flag |
|---|---|---|---|
| `-co` | `/codex-review` | `/codex-2nd` | `-co` |
| `-gco` | `/gco-review` | `/gco-2nd` | `-gco` |
| `-gcoc` | `/gcoc-review` | `/gcoc-2nd` | `-gcoc` |

**How combinations apply to each affected step:**

- **Step 5 (child self-review)**: Forward every active backend flag to `/light-review`. Example: `/light-review -co -gco -gcoc`. `/light-review` is expected to dispatch to each backend's reviewer in turn (or fall back silently for any unavailable backend). If the child only supports one flag at a time, fire `/light-review` once per backend sequentially.
- **Step 9 (quality assurance)**: Invoke each selected reviewer **sequentially** on the same `base/<project-name>` branch. Collect findings from every run into a single combined fix issue before delegating fixes. Do not stop after the first reviewer — even if it reports "no issues," still run the others. If `-l`/`--review-loop` is also passed, each backend still runs once (no multi-round per backend).
- **Planning-phase 2nd opinion**: When multiple backend flags are active, invoke every matching `*-2nd` command in sequence and read all of their feedback before finalizing the plan. Silent fallbacks (rate limits, unavailable CLIs) are fine — do not block on them.
- **Research and doc writing (`-co` interactions)**: When `-co` is combined with `-gco`/`-gcoc`, codex still owns `/codex-research` and `/codex-writer` for research/docs. For research specifically, you may additionally invoke `/gco-research` / `/gcoc-research` in parallel when the topic benefits from cross-source coverage, but this is optional — only `/codex-review` vs `/gco-review` vs `/gcoc-review` are **required** to all run.

**Fix delegation with combined findings:**

When creating the fix issue in Step 9, label findings by their source backend so the fix agent can weight them:

```markdown
## Review Findings to Fix

### From /codex-review
- ...

### From /gco-review
- ...

### From /gcoc-review
- ...
```

This preserves the quality-coverage benefit of running multiple reviewers — the fix agent sees agreements (stronger signal) and disagreements (judgment calls) rather than a flattened, homogenized list.

**If only one backend flag is passed**, behave exactly as described in the single-mode sections above (Codex Mode / GCO Mode / GCOC Mode). Combined Reviewer Mode activates only when ≥2 backend flags are present on the invocation.

---

### Step 2: Create Base Branch and Root PR

**CRITICAL: `-s` / `--stay` is STRICTLY opt-in.** Only use the `--stay` flow below if the user explicitly passed `-s` or `--stay`. Do NOT auto-detect `--stay` behavior based on the current branch state, existing PRs, or any other contextual clue. The default ALWAYS creates a new branch — even if you're on a branch that already has a PR.

#### Default flow (no `--stay`) — ALWAYS used unless `-s` / `--stay` explicitly passed

The base branch is created from whichever branch is currently checked out. The current branch becomes the PR target. This is true regardless of whether the current branch has an existing PR or not.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # Record before any checkout
```

**Determine `<parent-branch>`**: If the user specified a parent/base branch, use it. Otherwise, **default to the branch that was checked out when the command was invoked** (`INVOCATION_BRANCH`). For example, if invoked on `topic/foobar`, the parent branch is `topic/foobar`, not `main`.

**CRITICAL**: Create the root PR immediately with an empty commit. This locks in the correct parent branch from the start.

```bash
# Ensure parent branch is up to date
git checkout <parent-branch>
git pull origin <parent-branch>

# Create the base branch
git checkout -b base/<project-name>

# Create empty start commit and push
git commit --allow-empty -m "= start <project-name> dev ="
git push -u origin base/<project-name>

# Create the root PR immediately (draft, targeting parent branch)
# !! PR TARGET CHECK !! — <parent-branch> MUST be INVOCATION_BRANCH (recorded at Step 2 start),
# not the repo default branch. If the session was invoked from `topic/foo`, this MUST be
# `topic/foo`, not `main`. NEVER omit `--base` — `gh pr create` falls back to the repo default
# branch (usually main). That is the bug the top-of-file rule prohibits.
gh pr create \
  --base <parent-branch> \
  --title "<project-name>: root PR title" \
  --body "$(cat <<'EOF'
## Summary
(in progress)

## Topic PRs
(to be added as topics are completed)
EOF
)" \
  --draft
```

Save the root PR number — you will update it as topics are merged.

#### If `-s` / `--stay` is explicitly passed

The current branch is reused as the base branch. No new branch or empty commit is created.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # This IS the base branch
BASE_BRANCH="$INVOCATION_BRANCH"

# Determine the parent branch for the root PR target
PARENT_BRANCH=$(gh pr view "$BASE_BRANCH" --json baseRefName -q '.baseRefName' 2>/dev/null)
if [ -z "$PARENT_BRANCH" ]; then
  PARENT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
fi

# Check if a root PR already exists for this branch
EXISTING_PR=$(gh pr view "$BASE_BRANCH" --json number -q '.number' 2>/dev/null)
```

- If `EXISTING_PR` exists: reuse it as the root PR (record its number). No new PR needed.
- If no PR exists: create a new draft PR targeting `PARENT_BRANCH` (same as the normal flow above, but skip branch creation and empty commit).

### Step 3: Create Worktrees

For each topic:

```bash
# Create worktree with a topic branch based on the base branch
git worktree add worktrees/<topic-name> -b <project-name>/<topic-name> base/<project-name>
```

Example with 3 topics:

```bash
git worktree add worktrees/topicA -b marker-fix/topicA base/marker-fix
git worktree add worktrees/topicB -b marker-fix/topicB base/marker-fix
git worktree add worktrees/topicC -b marker-fix/topicC base/marker-fix
```

### Step 4: Environment Setup (if needed)

If the project has environment files, symlink them into each worktree:

```bash
for wt in worktrees/*/; do
  ln -sf "$(pwd)/.env" "$wt/.env" 2>/dev/null
  # Add project-specific symlinks as needed (e.g., metadata, generated files)
done
```

If using pnpm workspaces, install dependencies in each worktree:

```bash
for wt in worktrees/*/; do
  (cd "$wt" && pnpm install)
done
```

### Step 5: Spawn Child Agents via Teams

Use TeamCreate to create a team, then use the Task tool to spawn child agents — one per topic. Each agent works in its own worktree directory.

```
1. TeamCreate with team_name: "<project-name>"
2. TaskCreate for each topic (implementation tasks)
3. Task tool to spawn agents with:
   - subagent_type: "frontend-worktree-child" (or "general-purpose" for non-frontend topics)
   - team_name: "<project-name>"
   - name: "topic-<name>"  (e.g., "topic-topicA")
   - (**Do NOT pass a `mode:` param.** Agent-team teammates inherit the lead's permission mode at spawn time and per-teammate modes cannot be set — see [agent-teams docs](https://code.claude.com/docs/en/agent-teams#permissions). Permission prompts on file edits are handled entirely by the PreToolUse hook at `$HOME/.claude/hooks/allow-worktree-teammate-edits.sh`, which auto-approves Edit/Write/NotebookEdit when **either** the session cwd **or** the target file path sits under a `worktrees/<topic>/` segment. This covers both `frontend-worktree-child` teammates — which also carry `permissionMode: acceptEdits` in their agent definition — and `general-purpose` teammates used for non-frontend topics, whose session cwd inherits the lead's cwd and would otherwise block on every Edit. Confirm the hook is registered in `settings.json` before first use.)
   - model: the Claude model resolved from the model flag (`-haiku` / `-so` / `-op`). **Default: `opus`.** Always set `model:` explicitly on child agents (even at the default) so behavior is predictable.
   - prompt: Detailed instructions including:
     a. The worktree absolute path to work in
     b. What to implement for this topic
     c. Branch name: <project-name>/<topic-name>
     d. Base branch: base/<project-name>
     e. **COMMIT ONLY — DO NOT PUSH.** All commits stay local. Pushing happens later (Step 11) to save CI resources.
     f. **NO DIRECT BROWSER TOOLING.** Child agents must NEVER invoke `/headless-browser`, `/verify-ui`, or any Playwright / Chrome DevTools-backed tool. 6 concurrent Chromium instances will freeze the machine. If the topic needs browser-based verification, commit the code, then report back to the manager with: (1) the URL to check, (2) what to verify (specific selectors / computed styles / visual elements), (3) which branch. The manager will dispatch a dedicated one-shot Opus subagent for the browser check. See "Playwright / Browser Verification — Isolated Subagent Only" near the top of this skill.
     g. **NO HEAVY / PORT-BASED TESTS DURING IMPLEMENTATION.** Child agents must NOT run full e2e / integration suites, long-running builds, or hold a dev server (`pnpm dev`, `vite`, etc.) open for verification. Running these in parallel across worktrees causes port conflicts and CPU thrashing. Instead: commit the code and report back with "integration check needed — URL/endpoint, what to verify, branch." The manager runs these sequentially on the merged base branch. Unit tests, type-check, and lint are fine (they do not bind ports). If a short port-binding check is genuinely unavoidable, use the `flock` pattern in "Port-Based Servers & Heavy Local Tests — Resource Coordination" near the top of this skill to serialize across worktrees.
     h. (If issue tracking is active) The ISSUE_NUMBER and instruction to comment on it when done:
        `gh issue comment <ISSUE_NUMBER> --body "### topic-<name> — completed\n\n<summary of work done>"`
     i. **NO BACKTICKS / CODE FENCES IN SendMessage.** When reporting back to the manager or messaging peers via `SendMessage`, the `message` content must be plain prose — no backticks, no triple-backtick fences, no inline markdown code formatting. Write "src/foo.ts line 42", not the backtick-quoted form. This is a workaround for Claude Code Ink rendering bug #51855: any inline code span in a teammate message crashes the pane and tears down the whole team. Markdown is still fine in commits, PR bodies, issue comments, log files, and source code — just not in `SendMessage`. See "SendMessage Content — No Markdown Code Spans" near the top of this skill.
     j. **REBUILD TOUCHED WORKSPACE PACKAGES BEFORE REPORTING DONE.** If the project has a workspace/monorepo layout and the agent's commits touched source inside a package whose consumer imports through a built artifact (e.g. an `exports` map → `./dist/...`), the agent MUST rebuild that package and commit the resulting build output before declaring done. Editing source without rebuilding leaves the consumer loading stale compiled output — a classic stale-dist bug. The project's `CLAUDE.md` should name the workspace root (`packages/`, `sub-packages/`, `apps/`, etc.) and the rebuild command (`pnpm --filter <name> build`, `npm run build -w <name>`, etc.); the agent should defer to it. Skip silently only if the touched package has no `build` script or its build output is gitignored AND consumers import from source. A failed build is a blocker. (The `frontend-worktree-child` agent definition also carries this rule; the duplication here covers `general-purpose` teammates spawned for non-frontend topics.)
```

**Spawn child agents in parallel — BUT capped at 6 concurrent agents.** Use multiple Task tool calls in a single message for the first batch. Each agent should:

1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (pushing is deferred to Step 11)
4. **Run `/light-review`** to self-review their work — fix any clearly useful findings and commit. Forward whichever `-co` / `-gco` / `-gcoc` backend flags were on the original invocation. If no backend flag is active, `/light-review` falls to its own default (`-gcoc`). `/light-review` silently falls back if all routed backends are unavailable — no special handling needed.
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back with brief message only**: status (1-2 sentences), PR URL if created, and log file path. Do NOT send full summaries — the log file has the detail. The manager can read it via `/logrefer` if needed. **Plain prose only — no backticks or code fences in the `SendMessage` content** (see "SendMessage Content — No Markdown Code Spans" rule; Claude Code bug #51855 crashes the pane on inline code spans).

#### Concurrency Limit: Max 6 Child Agents at Once

**CPU load protection**: Never run more than **6 child agents concurrently**. Running 7+ parallel agents overloads the local machine (each agent runs code, tests, reviews, etc.).

**How to enforce:**

- **6 or fewer topics**: Spawn all in parallel as usual — no waiting needed.
- **7 or more topics**: Spawn only the first 6 in parallel. Queue the remaining topics. When any active agent completes and reports back, spawn the next queued topic. Continue until the queue is empty.

**Example with 8 topics:**

1. Spawn topics 1–6 in parallel (single message, 6 Task tool calls)
2. Wait for any one agent to complete (e.g., topic 3 finishes)
3. Spawn topic 7
4. Wait for another agent to complete (e.g., topic 1 finishes)
5. Spawn topic 8
6. Wait for all remaining agents (topics 2, 4, 5, 6, 7, 8) to complete

This keeps the active agent count at ≤6 at all times. The overall wall-clock time is longer than full-parallel, but the machine stays responsive.

### Step 6: Review and Merge Topic Branches Locally

Since child agents committed locally without pushing, merge their topic branches into the base branch **locally** using git:

```bash
git checkout base/<project-name>

# Merge each topic branch into base (regular merge, not squash)
git merge <project-name>/topicA
git merge <project-name>/topicB
git merge <project-name>/topicC
```

Review the combined diff to make sure everything looks right:

```bash
git diff <parent-branch>...base/<project-name> --stat
```

### Step 7: Shut Down Child Agents and Remove Worktrees

All child agents are done and their branches have been merged. Shut down the team and clean up worktrees immediately.

1. **Send shutdown to each agent individually** (structured messages cannot be broadcast to `"*"`):

```
For each child agent (e.g., "topic-topicA", "topic-topicB", ...):
  SendMessage: to="topic-<name>", message={type: "shutdown_request", reason: "All topics merged into base branch. Work complete."}
```

Send all shutdown messages in parallel (multiple SendMessage calls in a single response).

2. **Wait for shutdown confirmations**, then **delete the team**:

   ```
   TeamDelete
   ```

3. **Remove worktrees** — they are no longer needed (topic branches survive independently):

   ```bash
   for wt in worktrees/*/; do
     git worktree remove "$wt"
   done
   ```

4. **Fix pnpm symlinks** if the project uses pnpm workspaces (worktree removal can break symlinks):

```bash
pnpm install --ignore-scripts 2>/dev/null || true
```

This closes the tmux panes for all child agents and frees disk space. The rest of the workflow (review, push, CI) is handled by the manager alone.

### Step 8: Sync Local Base Branch

Ensure the base branch is up to date with any remote changes (e.g., if the root PR's empty commit was pushed in Step 2):

```bash
git fetch origin base/<project-name>
git merge origin/base/<project-name>
```

After syncing, **re-read the issue TODO** to confirm the next step:

```bash
gh issue view "$ISSUE_NUMBER"
```

The next step is **Step 9: Quality Assurance**. You MUST run it before pushing. Do NOT skip ahead to pushing.

---

### !! MANDATORY CHECKPOINT: Step 9 — Quality Assurance !!

**STOP. Before you push ANYTHING, you MUST run the review step.** This step is the most commonly skipped step in long workflows because the context gets long after managing multiple child agents. **Read this carefully and execute it.**

**CRITICAL: The review MUST run on the base branch in the main repo directory** (NOT in a worktree or isolated context). At this point, topic branches have been merged locally but NOT pushed — the merged commits only exist in the local base branch. Reviewers spawned with `isolation: "worktree"` or in separate worktrees will NOT see the unpushed merged changes and will report "no code to review." Always run the review from the main repo root on `base/<project-name>`.

#### `--no-review` opt-out (skip Step 9 entirely)

If `--no-review` or `-nor` was passed on the invocation, **skip this step entirely** — do not invoke any review skill, do not delegate fixes, do not block before Step 11. Proceed straight to Step 10 (if `--verify-ui` was passed) or Step 11 (push).

This flag exists for one purpose: when `/deep-review -t` (the default team-fix path) spawns a child `/x-wt-teams --no-review --stay` to apply fixes, the child must NOT run its own `/deep-review` again — that would loop forever (`/deep-review -t` → `/x-wt-teams` → `/deep-review -t` → …). Manual users almost never pass this flag.

#### Review Loop Mode (`-l` / `--review-loop`)

If `-l` or `--review-loop` was passed (and `--no-review` was NOT), invoke `/review-loop 5 --aggressive --issues` instead of `/deep-review`. If `--noi` / `--noissue` / `--noissues` was also passed, omit the `--issues` flag (i.e., invoke `/review-loop 5 --aggressive`). This runs 5 rounds of aggressive review-fix cycles for thorough quality improvement.

```
Skill tool: skill="review-loop", args="5 --aggressive --issues"
# or without --issues if --noi was passed:
Skill tool: skill="review-loop", args="5 --aggressive"
```

#### Default Mode

If neither `--review-loop` nor `--no-review` was passed, invoke `/deep-review` as usual:

```
Skill tool: skill="deep-review"
```

`/deep-review` defaults to `-t` team-fix mode, which means **it handles its own fix delegation internally** — after collecting findings, it spawns a fresh `/x-wt-teams --no-review --stay` session that creates a fix worktree, applies the fixes, commits, merges back into `base/<project-name>`, and pushes. By the time `/deep-review` returns, fixes are already committed and pushed (and the inner session also ran `/pr-revise` on the root PR). You do NOT need to create a fix issue, spawn an Agent, or call `/pr-revise` from this step — that is all done inside `/deep-review`.

If you specifically want the legacy inline-fix flow (manager applies fixes in its own context, no nested `/x-wt-teams`), invoke `/deep-review -nt` instead — useful in resource-constrained sessions or when the diff is tiny.

#### Common Steps

1. **Invoke the review skill** as described above (`/deep-review` for default mode, `/review-loop 5 --aggressive [--issues]` for `-l`).
2. **Wait for it to complete** — when it returns:
- If `/deep-review` ran in default `-t` mode: the fixes are already applied, committed, and pushed by the inner `/x-wt-teams --no-review --stay` session. The base branch is in its post-fix state.
- If `/deep-review -nt` was invoked: fixes were applied inline; no inner team session ran.
- If `/review-loop` ran: it ran multiple review-fix cycles internally.
- If the review reported no actionable issues: nothing changed; just continue.
3. **Confirm the base branch state** before proceeding (`git log --oneline -5`, `git status`) so you know whether new commits were added by the review skill.
4. **Proceed to Step 10** (if `--verify-ui`) or Step 11.

If you are about to run `git push` and you have NOT yet invoked the review skill in this session (and `--no-review` was NOT passed), **STOP and go back to this step.**

---

### Step 10: Verify UI (optional)

**Only run this step if `-v` / `--verify-ui` was passed.** Skip otherwise.

After the review step (Step 9) is complete and fixes are committed:

1. **Launch a verification target** — start the project's dev server, use a PR preview URL, or any other means to get the implementation running in a browser
2. **Dispatch a disposable Opus subagent to run `/verify-ui`** — do NOT invoke `/verify-ui` in the manager's own context. See "Playwright / Browser Verification — Isolated Subagent Only" above for the exact Agent-tool invocation pattern. The subagent loads Playwright, runs the check, returns a PASS/FAIL report, and is torn down when the Agent call returns. Spawn one subagent per discrete verification (sequential, never parallel).
3. If the subagent reports issues, fix them **in the manager context** (no browser needed for the fix itself) and commit locally (do NOT push yet). Then spawn a **fresh** subagent for the re-verification pass — never reuse the earlier subagent.

This step ensures that visual/UI changes are not just code-correct but render correctly in the browser. Skip if the changes are purely backend or non-visual.

---

### Step 11: Push All Changes to Remote

**Pre-push gate**: Before pushing, confirm you have already run the quality assurance review (Step 9). If you skipped it, go back now.

Push everything to remote **in one batch**. This is the first time anything is pushed after the initial empty commit — saving CI resources by avoiding intermediate pushes.

```bash
# Push the base branch (contains all merged topic work + review fixes)
git push origin base/<project-name>

# Push topic branches so PRs can be created for documentation
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  git push origin "$branch"
done
```

After pushing, create topic PRs for documentation/tracking, close them, then **immediately delete topic branches**.

**IMPORTANT**: Topic branches were already merged locally into the base branch (Step 6). If the remote base branch already contains the topic commits (because the base was pushed first), `gh pr create` will fail with "No commits between base and head". Always guard against this — check if the PR was actually created before trying to close it. **Never call `gh pr close` with an empty PR number** — `gh` will default to closing the current branch's PR (the root PR), which is destructive.

```bash
# For each topic branch, create PR, close it, then delete the branch
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  # Attempt to create PR — may fail if topic is already merged into base
  if gh pr create --base base/<project-name> --head "$branch" --title "<topic> implementation" --body "Part of <project-name> development" --fill 2>/dev/null; then
    PR_NUM=$(gh pr list --head "$branch" --json number -q '.[0].number')
    if [ -n "$PR_NUM" ]; then
      gh pr close "$PR_NUM" --comment "Already merged into base branch locally"
    fi
  fi
done

# Clean up topic branches immediately (they're merged into base, PRs are closed)
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  git branch -d "$branch"                 # delete local
  git push origin --delete "$branch"      # delete remote
done
```

This prevents stale topic branches from accumulating. Only the base branch remains (needed for the root PR).

### Step 12: CI Watch (Verify CI Passes)

**Only perform this step if the project has CI configured.** Check with `gh pr checks <root-pr-number>` — if no checks exist, skip to Step 13.

Invoke `/watch-ci <root-pr-number>` to monitor CI. The `/watch-ci` skill handles polling, notifications, and failure investigation internally.

- **If CI passes**: Proceed to Step 13
- **If CI fails**: Investigate and fix
  - Fetch failed run logs: `gh run view <run-id> --log-failed`
  - Fix the issue, commit, push, and re-watch CI
  - **IMPORTANT**: Only attempt CI fixes if the failure is related to the changes made (not pre-existing failures or infrastructure issues)
- **If CI still fails after a fix attempt**: Stop and ask the user for guidance. Explain what failed, what was tried, and why it could not be resolved automatically

If the task is intentionally CI-breaking (e.g., adding new linting rules, migrating frameworks), **skip CI verification** and inform the user.

### Step 13: Update Root PR and Mark Ready

Invoke `/pr-revise` to analyze the full diff between the parent branch and `base/<project-name>`, and update the root PR title and description to accurately reflect all combined changes from the merged topics.

After `/pr-revise` completes, mark the PR as ready:

```bash
# Mark ready for review (remove draft status)
gh pr ready <root-pr-number>
```

---

### Step 14: Session Report

Generate a structured session report. This report serves two purposes: (1) a log for future Claude Code sessions to reference via `/logrefer`, and (2) a GitHub issue comment for human visibility.

#### Report Content

Write a markdown report summarizing:

- Project name and scope
- Topics implemented (one bullet per topic with brief summary of what each child agent did)
- Key decisions and architectural choices
- Review findings and fixes applied (from `/deep-review`)
- CI status (pass/fail/skipped)
- Root PR URL and topic PR URLs

#### Save to Log Directory

```bash
$HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-x-wt-teams-{slug}.md" "<report content>"
```

Where `{slug}` is derived from the project name (e.g., `marker-fix`).

#### Post to GitHub Issue

If a GitHub issue is linked (`ISSUE_NUMBER` is set), post the report as an issue comment:

```bash
gh issue comment "$ISSUE_NUMBER" --body "<report content>"
```

---

### Step 15: Requirements Verification

**Only run this step when a GitHub issue is linked** (`ISSUE_NUMBER` is set — either passed as argument, provided by the user, or created in Step 1). Skip if no issue is linked (`--no-issue` was used).

After the session report, verify that the original requirements have been fully implemented:

#### 1. Re-read the Issue

```bash
gh issue view "$ISSUE_NUMBER"
```

Read the **initial issue body** and any **early comments** (especially the first 1-2 comments) to extract the original requirements. These represent what the user actually asked for.

#### 2. Compare Against Implementation

Check every requirement, acceptance criterion, and bullet point from the issue against what was actually implemented. Be thorough — check the code, not just commit messages.

#### 3. Handle Missing Requirements

- **If all requirements are met**: Proceed to STOP. Add a comment on the issue confirming:

  ```bash
  gh issue comment "$ISSUE_NUMBER" --body "All original requirements verified as implemented."
  ```

- **If requirements are missing**: Do NOT stop. Instead:
  1. Comment on the issue listing the missing requirements:

     ```bash
     gh issue comment "$ISSUE_NUMBER" --body "### Requirements gap found\n\nMissing: <list of missing items>\n\nContinuing implementation..."
     ```

  2. **Re-run Steps 3–14 using `--stay` semantics** on the existing base branch — same as the Feedback Loop. Create new worktrees, spawn child agents, implement the missing parts, merge, review, push, CI watch, update PR
  3. **Re-run this verification step** after the additional implementation is complete
  4. Repeat until all original requirements are satisfied

This creates a self-correcting loop that ensures nothing from the original spec is missed, even in long workflows where context can drift.

---

### Super-Epic: Merge Epic-PR into Super-Epic Base (MANDATORY)

**Only run when this session is Super-Epic child mode** — i.e., the epic issue body contained `**Super-epic:** #N` and `SUPER_EPIC_NUMBER` was captured in Step 1a item 9. Skip entirely for non-Super-Epic sessions (the non-Super-Epic session leaves its root PR open for the user to review and merge).

**This step always runs in Super-Epic child mode, regardless of `-a` / `--auto`.** `-a` is intentionally ignored in Super-Epic mode (see "Auto-Complete Mode" below for the rationale) — do NOT skip this mandatory merge thinking `/pr-complete` will handle it.

**Why this step is mandatory:** A super-epic stacks many epic-PRs on the same super-epic base branch, one per `/x-wt-teams` session. If an epic-PR is left open at STOP, the next epic's session branches off a stale super-epic base — its topics won't include this epic's work, sibling epic-PRs conflict on shared files, review context fragments across stacked branches, and the super-PR never converges. With many epics in flight, the backlog of unmerged epic-PRs becomes unrecoverable. **Each epic session must merge its own epic-PR before STOP — no exceptions, no "the user can merge it later" shortcuts.**

**1. Confirm CI is green on the root (epic) PR.** Step 12 already watched CI, but re-check before merging:

```bash
gh pr checks <root-pr-number>
```

If any required check is failing, do NOT merge — fix the failures first using the same pattern as Step 12 (`gh run view --log-failed`, fix, commit, push, re-watch). Do not bypass a red check to satisfy the merge mandate.

**2. Merge the epic-PR into the super-epic base.** Use a regular merge (not squash — matches Rule 5, preserves the topic merge commit history so the super-PR diff is reviewable per-epic):

```bash
gh pr merge <root-pr-number> --merge --delete-branch
```

`--delete-branch` deletes the remote epic base branch (`base/<super-title-slug>-<epic-slug>`) — the work now lives in the super-epic base. The local epic base branch still exists; do NOT delete it or switch off it (the STOP rules below still apply).

**3. Comment on the super-epic issue** with a link to the merged epic-PR. This is how the super-epic tracks progress across its child epics (per Step 1a item 7):

```bash
EPIC_PR_URL=$(gh pr view <root-pr-number> --json url -q .url)
gh issue comment "$SUPER_EPIC_NUMBER" --body "Epic #$ISSUE_NUMBER merged into the super-epic base: $EPIC_PR_URL"
```

**4. Do NOT close the super-epic issue.** It stays open until all sibling epic-PRs are merged. The "All epics complete" branch of the Auto-Suggest Next Command step below is where the user is told the super-PR is ready — closing the super-epic issue is not part of this skill.

After this step, proceed to Close Tracking Issue → Auto-Suggest Next Command → STOP. The Auto-Suggest message's `Just finished: #N — merged into base/<super-title-slug>` line is accurate only because this step actually ran.

---

### Auto-Complete Mode (`-a` / `--auto`)

**Only run this step if `-a` or `--auto` was passed AND this session is NOT Super-Epic child mode.** Otherwise, skip to STOP below.

**Why `-a` is ignored in Super-Epic child mode:** The mandatory "Super-Epic: Merge Epic-PR into Super-Epic Base" step above already merges the epic-PR into the super-epic base — that's the only merge a Super-Epic child session is responsible for. Adding `-a` is redundant there, and the flag is also semantically misleading: a user might read "auto-merge" as "also merge the super-epic base into main / origin branch," which this skill never does (the super-PR is merged later, in a different session, by the user). To prevent that confusion, Super-Epic child sessions do NOT honor `-a` — the mandatory step always handles the epic-PR merge, and the super-epic base stays open for the next sibling epic.

After requirements verification passes (Step 15), automatically invoke `/pr-complete -c -w` to:

1. Wait for CI checks to pass
2. Merge the root PR (`--merge --delete-branch`)
3. Close the linked issue (`-c`)
4. Watch post-merge CI on the target branch (`-w`)

This is intended for safe-to-merge, fully automated workflows. If CI fails or the PR cannot be merged, `/pr-complete` will handle the error reporting.

**After `/pr-complete` succeeds**, checkout the merged target branch and pull:

```bash
# Determine the target branch the PR was merged into
TARGET_BRANCH=$(gh pr view <root-pr-number> --json baseRefName -q '.baseRefName')

# Checkout and pull the target branch
git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"
```

This leaves the user on the up-to-date target branch (e.g., `main`) after a fully automated workflow.

---

### Raising Issues for Unrelated Findings (Default Behavior)

During coding and reviewing (both by the manager and child agents), you may discover problems that are **unrelated to the original topic** — e.g., pre-existing bugs, code smells in adjacent files, outdated dependencies, or inconsistencies in code that was not part of the task. By default, **always raise these as separate GitHub issues** so they are tracked and not lost.

**When to raise:**

- A reviewer flags a problem in code that was NOT modified by this workflow
- You or a child agent notices a bug or code quality issue in adjacent code while implementing
- A pre-existing test failure or lint warning is discovered
- Any problem that is clearly outside the scope of the current task

**How to raise:**

```bash
gh issue create \
  --title "<concise description of the unrelated problem>" \
  --body "$(cat <<'EOF'
## Found during

Root PR: <ROOT_PR_URL> (or branch: base/<project-name>)

## Description

<what the problem is, where it is, and why it matters>

## Suggested fix

<brief suggestion if obvious, otherwise omit>

---
*Discovered during `/x-wt-teams` workflow — not related to the original task.*
EOF
)"
```

**Suppressing with `--no-raise-issues` / `-noi`:** When `-noi` or `--no-raise-issues` is passed, do NOT raise GitHub issues for unrelated findings. Simply ignore them and focus only on the original task. Also pass this flag context to child agents so they skip raising issues too.

---

### Close Tracking Issue

**Always close the tracking issue when the workflow ends** (unless `--no-issue` was used and no issue exists). The tracking issue is a workflow log — it has served its purpose once the PR is ready.

```bash
gh issue close "$ISSUE_NUMBER" --comment "Workflow complete. Root PR: <ROOT_PR_URL>"
```

If any problems were discovered during the workflow that need follow-up, raise them as **separate issues** before closing the tracking issue. The tracking issue itself should not remain open as a to-do item.

**Exception**: If the issue was provided by the user (not created by this workflow), do NOT close it — the user may want it to remain open for other purposes.

---

### Auto-Suggest Next Command (MANDATORY when session is part of a multi-session plan)

**You MUST run this step before STOP whenever this session is part of a multi-session plan.** Skipping it means the user has to manually type "give me next command" every time — defeating the whole point of the rule. This covers BOTH Super-Epic child mode AND `--stay` accumulating-epic wave sessions.

Print a concrete, copy-pasteable `/x-wt-teams <url> [flags] <instructions>` line as the final block of your session output (just before the generic "workflow complete" closing). Use the literal URL from `gh` output — do NOT reconstruct URLs.

**When to fire — detect either of these signals:**

- **Signal A — Super-Epic child session**: the epic issue body contains a `**Super-epic:** #N` marker (captured as `SUPER_EPIC_NUMBER` in Step 1a item 9). → Use **Super-Epic variant** below.
- **Signal B — Accumulating-epic wave session**: the session was invoked with `-s` / `--stay` AND the user's original instructions contain ANY of:
  - "wave" / "Wave N<letter>" / "Sub N" / "next sub" / "next wave"
  - "accumulating epic PR" or "Do NOT ... merge PR #NNNN" or "Do NOT run /pr-complete"
  - "close the sub-issue" (sequential sub-issue pattern)
  - An enumerated list of remaining sub-issues / waves
  - The session merged a sub-issue into the epic base and the epic PR stayed open

  → Use **Accumulating-epic variant** below.

If neither signal applies, skip auto-suggest and fall through to STOP.

---

#### Super-Epic variant

**Only run when Super-Epic child mode is detected** (Signal A above). Skip entirely for non-Super-Epic sessions.

After the tracking issue is closed, help the user pick up the next epic by inspecting the super-epic and printing a ready-to-run `/x-wt-teams` command.

1. **List sibling open epic issues under this super-epic:**

   ```bash
   REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
   gh issue list --repo "$REPO" --label epic --state open --limit 200 \
     --json number,title,url,body \
     --jq "[.[] | select(.body | contains(\"**Super-epic:** #$SUPER_EPIC_NUMBER\")) | select(.number != $ISSUE_NUMBER) | {number, title, url}]"
   ```

   This returns all OPEN sibling epics (excluding the current one, which was just completed). Epics whose PR is merged are closed by `/pr-complete` or the user, so they are naturally excluded.

2. **Pick the next epic** — use the first remaining entry. The super-epic issue body lists epics in dependency order, and `gh issue list` returns them in creation order (which matches the order `/big-plan` created them). If you are uncertain about dependency order, fall back to reading the super-epic body:

   ```bash
   gh issue view "$SUPER_EPIC_NUMBER" --json body --jq .body
   ```

   and pick the earliest-listed open sibling.

3. **Print the hand-off message** (this is the guidance the user sees at session end):

   ```
   ## Super-Epic: Next epic ready

   Just finished: #<ISSUE_NUMBER> — merged into base/<super-title-slug>
   Super-epic:    #<SUPER_EPIC_NUMBER>

   Run the next epic in a FRESH session:

       /x-wt-teams <next-epic-url>

   Remaining open epics under this super-epic:
   1. #<next-number>  <next-title>   ← run next
   2. #<other-number> <other-title>
   ...
   ```

   Use the literal URL from `gh issue list` output (`.url` field) so the user can copy-paste the command directly — do not reconstruct it.

4. **If no open siblings remain** (all epics done), this is the **last** Super-Epic child session. Run the special "all-done" hand-off instead:

   a. **Auto-checkout the super-epic base.** Up to this point the rule has been "stay on the epic base branch" — but now this epic-PR is merged into the super-epic base, so the epic base is finished work. Switching to the super-epic base puts the user on the branch that holds the entire super-epic and is the natural surface for the final quality pass.

      ```bash
      # Read the super-epic base from the epic issue body marker (already captured in Step 1a item 9).
      SUPER_EPIC_BASE=$(gh issue view "$ISSUE_NUMBER" --json body --jq .body \
        | grep -oE '\*\*Super-epic base branch:\*\* `base/[^`]+`' \
        | sed -E 's/.*`base\/([^`]+)`.*/base\/\1/' | head -1)

      git fetch origin "$SUPER_EPIC_BASE"
      git checkout "$SUPER_EPIC_BASE"
      git pull origin "$SUPER_EPIC_BASE"
      ```

      This is the **only** place in the entire skill where checking out a different branch at end-of-session is allowed (it overrides Important Rule 1). It is gated tightly: ALL sibling epics must be merged AND this must be Super-Epic child mode AND the auto-suggest detector saw zero open siblings. If any of those conditions are not true, do NOT switch branches — fall through to the "next epic ready" branch above.

   b. **Print the all-done hand-off** with a concrete `/deep-review -t` suggestion as the next command:

      ```
      ## Super-Epic: All epics complete

      Super-epic: #<SUPER_EPIC_NUMBER>
      All child epics have been merged into <SUPER_EPIC_BASE>.

      You are now on <SUPER_EPIC_BASE> (super-epic root branch). The super-PR is ready
      for a final quality pass before being merged into main.

      Run this in a FRESH session to do the final review-and-fix:

          /deep-review -t

      That review covers the full super-epic diff, finds quality issues across all the
      merged epic work, and applies fixes via a fresh agent team merging back into
      <SUPER_EPIC_BASE>. Once the review pass is clean, merge the super-PR into main.

      See the super-epic issue for the super-PR URL.
      ```

   The `/deep-review -t` invocation here is the user's final action on the super-epic — `-t` is the default in `/deep-review`, but include it explicitly in the printed command so the user understands the team-fix mode is what makes this safe-to-run on a large multi-epic diff.

This hand-off replaces the generic "workflow complete" closing when running under Super-Epic child mode — it keeps the user's momentum on the multi-epic plan without forcing them to go back to the super-epic issue to look up the next URL manually, and now also pre-positions them on the super-epic base so the final `/deep-review -t` runs on the right branch.

---

#### Accumulating-epic variant

**Only run when Signal B is detected** — the session used `-s` / `--stay` on an accumulating epic base branch, and the user's original instructions indicated a sequential wave/sub-issue pattern. Skip entirely otherwise.

This covers the pattern where the user runs `/x-wt-teams <sub-issue-url> --stay ...` repeatedly against the same epic base branch (e.g., `base/design-token-panel`), merging one sub-issue at a time while the epic PR (e.g., #1440) stays open and accumulates changes. At session end, the user expects the next session's command to be pre-assembled.

**1. Identify the accumulating epic PR and epic base branch** — both are usually already known from Step 2 / user instructions:

```bash
# Current branch is the accumulating epic base (we stayed on it)
EPIC_BASE=$(git branch --show-current)   # e.g., base/design-token-panel

# Accumulating epic PR number: parse from user's original instructions
# (phrases like "PR #1440", "merge PR #NNNN", "accumulating epic PR #NNNN").
# If not stated, fall back to: the open PR whose head is EPIC_BASE.
EPIC_PR=$(gh pr list --head "$EPIC_BASE" --state open --json number --jq '.[0].number')
```

**2. Find remaining sub-issues.** Prefer (in order):

1. An explicit enumerated list in the user's original instructions (e.g., "Sub 10a, Sub 10b, Sub 10c — run each in a fresh --stay session"). Pick the next one not yet closed.
2. Sub-issues linked from the accumulating epic PR body / epic tracking issue. Fetch and filter to open ones:

   ```bash
   gh pr view "$EPIC_PR" --json body --jq .body
   # Scan for "#NNNN" references; check each with `gh issue view <n> --json state` and keep open ones.
   ```

3. Sibling open issues under the same parent/epic issue (if one was referenced in user instructions).

If you cannot confidently identify a next sub-issue, print the "no-next-found" fallback message (below) instead of guessing.

**3. Print the hand-off message** with a concrete, copy-pasteable `/x-wt-teams` command mirroring this session's pattern:

```
## Accumulating Epic: Next sub ready

Just finished: #<closed-sub-number> — merged into <EPIC_BASE>
Accumulating epic PR: #<EPIC_PR> (stays open)

Run the next sub in a FRESH session:

    /x-wt-teams <next-sub-issue-url> <model-flags> <wave-label> only: <short sub description>. --stay on <EPIC_BASE>. Merge into base via --no-ff, push, then close the sub-issue. Do NOT run /pr-complete or merge PR #<EPIC_PR> (accumulating epic PR).

Remaining open sub-issues:
1. #<next-number>  <next-title>   ← run next
2. #<other-number> <other-title>
...
```

Key requirements for the printed command:

- **Same model/backend flags** as this session (e.g., `-gcoc`, `-haiku`, `-co`). Forward whatever was used.
- **`--stay` MUST be present** — this is an accumulating-epic continuation, not a fresh workflow.
- **Wave/sub label** (e.g., "Wave 4b only: Sub 10b #1493 —") if the user's original instructions used one; omit if not.
- **Explicit "Do NOT run /pr-complete or merge PR #<EPIC_PR> (accumulating epic PR)"** clause, so the next session preserves the accumulating pattern.
- **Use the literal issue URL** from `gh` output — do not hand-construct `github.com/...` URLs.

**4. No-next-found fallback.** If no remaining sub-issue can be confidently identified, print:

```
## Accumulating Epic: Last sub complete (or next sub unclear)

Just finished: #<closed-sub-number> — merged into <EPIC_BASE>
Accumulating epic PR: #<EPIC_PR> (stays open)

Could not auto-detect the next sub-issue. If more waves remain, tell me the next sub-issue URL or point me at the tracking doc. Otherwise, the accumulating epic PR is ready for the final push / merge.
```

This hand-off keeps the wave cadence autonomous — the user's "give me next command" follow-up should become unnecessary.

---

### STOP — WORKFLOW ENDS HERE

**After the tracking issue is closed (or skipped), auto-complete finishes (if applicable), AND the Auto-Suggest Next Command step above has run (whenever its signals matched), the automated workflow is DONE.** Report the root PR URL and wait for user response.

**Before printing the final "workflow complete" block, verify that the Auto-Suggest Next Command step ran if its signals applied.** If Signal A (Super-Epic) or Signal B (`--stay` accumulating-epic wave) matched and you did NOT yet print a next-command hand-off, go back and print it now. The user should NEVER have to type "give me next command" for a session that was part of a multi-session plan.

**CRITICAL RULES at this point:**

- **If `-a` / `--auto` was used and the PR was merged**: You are already on the target branch (e.g., `main`) after the auto-complete checkout+pull. Stay there.
- **If Super-Epic child mode AND this was the last epic** (all sibling epics already closed): You are already on the super-epic base after the all-done branch of Auto-Suggest Next Command did `git checkout <SUPER_EPIC_BASE> && git pull`. Stay there.
- **Otherwise**: **Stay on `base/<project-name>`.** Do NOT checkout `main`, the parent branch, or any other branch.
- **Do NOT run Step 16** (unless `-a` was used and the PR is already merged). Step 16 is cleanup that only happens later, after the user has reviewed and merged the PR.
- **Do NOT delete any branches** (local or remote) unless `-a` was used (in which case the merge branch is already deleted by `--delete-branch`).
- **Do NOT do anything else** unless the user asks.

The user will review the PR and may:

1. **Provide feedback** — see "Feedback Loop" below. Handle it automatically.
2. **Merge the PR** — then Step 16 can be run if the user asks.

---

### Feedback Loop: Iterating on User Feedback

After you report the root PR, the user often replies with feedback — requests for changes, fixes, or improvements. This feedback can range from small single-file tweaks to substantial multi-area rework.

**When user feedback is received, re-run Steps 3–14 using `--stay` semantics on the existing base branch.** This spins up new agent teams to implement the fixes, following the same structured workflow. The base branch and root PR already exist — no need to recreate them.

#### How it works

1. **Analyze the feedback** — break it into discrete topics. Each heading, bullet group, or distinct concern becomes a separate topic. If there's only one small concern, a single topic is fine.
2. **Create new worktrees and topic branches** off the existing base branch (Step 3)
3. **Spawn new child agent teams** (Steps 4–5):
- Use `TeamCreate` with an incremented team name: `<project-name>-v2`, `<project-name>-v3`, etc.
- New topic branches: `<project-name>/<new-topic-name>`
- New worktrees: `worktrees/<new-topic-name>`
- Include the user's feedback verbatim in child agent prompts so they have full context
4. **Follow the same workflow**: merge topics → shut down agents → sync → deep review → push → CI watch → update PR (Steps 6–14)
5. **Report back** and wait for the next round of feedback

#### Key points

- **No new base branch or root PR** — reuse what already exists. The root PR accumulates all iterations.
- **New team name per iteration** — `<project-name>-v2`, `-v3`, etc. to avoid team name collisions.
- **Issue tracking continues** — if `ISSUE_NUMBER` is set, comment on the issue with the feedback iteration progress.
- **Repeat as needed** — each round of feedback triggers a new iteration. The loop continues until the user is satisfied and merges the PR.
- **Small feedback** still uses this pattern — even a single-topic fix benefits from the structured workflow (worktree isolation, review, CI check).

---

### Step 16: Cleanup (ONLY when user asks, after PR is merged)

**NEVER run this step automatically.** Only run when the user explicitly asks to clean up after the root PR has been merged.

By this point, worktrees (Step 7) and topic branches (Step 11) have already been cleaned up. Only the base branch remains:

```bash
# Delete base branch (local + remote)
git branch -d base/<project-name>
git push origin --delete base/<project-name>
```

Even during cleanup, do NOT checkout main or the parent branch. Stay on whatever branch you are on.

## Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base branch | `base/<project>` | `base/marker-fix` |
| Topic branch | `<project>/<topic>` | `marker-fix/bogaudio-knobs` |
| Worktree dir | `worktrees/<topic>` | `worktrees/bogaudio-knobs` |

## Important Rules

1. **NEVER checkout main or parent branch** — after the workflow completes (Step 13), stay on `base/<project-name>`. Do NOT switch branches, do NOT delete branches, do NOT run Step 16. The workflow ends at Step 15. Step 16 is only run later when the user explicitly asks. **Exceptions**: (a) when `-a`/`--auto` is used and the PR is merged, checkout the target branch and pull; (b) in **Super-Epic child mode**, when the Auto-Suggest Next Command step detects this is the last epic (all siblings closed), checkout the **super-epic base branch** so the user is positioned for the final `/deep-review -t` pass — see "Auto-Suggest Next Command → Super-Epic variant → all-done branch" for the gating conditions
2. **Fully autonomous** — never ask the user to manually start sessions or cd into worktrees. Use Task tool to spawn agents
3. **Always pull the parent branch before creating the base branch** — stale bases cause conflicts
4. **Create the root PR immediately in Step 2** — an empty commit + draft PR locks in the correct parent branch
5. **Never force push** — regular merge only, preserves history
6. **Push-forbid during work** — child agents commit locally only. All pushing happens in Step 11 after deep review. This saves CI resources
7. **Topic branches merge locally first** — the manager merges topic branches into base via `git merge`, not GitHub PR merge. Topic branches are pushed later for documentation only
8. **Root PR targets the parent branch** — this is handled automatically by creating it in Step 2
9. **worktrees/ must be in .gitignore** — worktrees are local only
10. **Manager stays at repo root** — never cd into worktrees for git ops
11. **Each child agent works in its worktree** — git ops affect that branch only
12. **Quality assurance before pushing** — always run the review step after merging all topics (Step 9). This is mandatory, never skip it
13. **CI watch after pushing** — if the project has CI, invoke `/watch-ci` on the root PR (Step 12). If CI fails, fix and re-push
14. **Re-read the issue TODO after every step** — use `gh issue view` to check the TODO checklist and confirm what comes next. This prevents forgetting steps during long workflows
15. **Issue tracking by default** — create a GitHub issue with TODO checklist and comment progress at each step. Skip with `--no-issue` or if the user says not to. Close the issue when the root PR is merged
16. **pnpm worktree cleanup breaks symlinks** — when worktrees are removed (Step 7), pnpm workspace symlinks in `node_modules/` may point to deleted worktree paths. Step 7 includes a `pnpm install --ignore-scripts` fix for this
17. **NEVER auto-detect `-s` / `--stay`** — always create a new base branch and root PR unless the user explicitly passes `-s` or `--stay`. Do not infer `--stay` from branch state, existing PRs, or context
18. **Max 6 concurrent child agents** — when spawning child agents in Step 5, never run more than 6 in parallel. If there are 7+ topics, queue the remainder and spawn them as earlier agents complete. This prevents CPU overload
19. **Playwright / browser tools go through an isolated one-shot Opus subagent** — neither the manager nor any child agent may invoke `/headless-browser`, `/verify-ui`, or any other Playwright / Chrome DevTools-backed tool directly. Multiple concurrent browser instances freeze the machine and bloat context with huge snapshot output. Every browser check is dispatched to a fresh disposable Opus subagent (via the Agent tool) that runs one sequential confirmation and is torn down on return. At most one such subagent alive at a time. See "Playwright / Browser Verification — Isolated Subagent Only" near the top of this skill for the exact pattern
20. **No heavy / port-based tests in child agents** — full integration suites, long e2e runs, held-open dev servers, and anything that binds a port must NOT run in child agents during implementation. Running these in parallel across worktrees causes port conflicts and CPU thrashing. Children commit + report back; the manager runs these sequentially on the merged base branch (naturally during Step 9 quality assurance or Step 10 UI verification). Legitimate short port-binding work inside a child uses `flock` on `/tmp/x-wt-teams-<repo>-locks/port-<N>.lock` to serialize across worktrees. See "Port-Based Servers & Heavy Local Tests — Resource Coordination" near the top of this skill for the full pattern
21. **Auto-Suggest Next Command is MANDATORY for multi-session plans** — before STOP, if the session is part of a multi-session plan (Super-Epic child marker present, OR `--stay` was used with "wave/sub/accumulating epic/Do NOT merge PR/close the sub-issue" signals in the user's original instructions), you MUST print a concrete, copy-pasteable `/x-wt-teams <next-url> [flags] <instructions>` command as the final block of session output. The user should never have to type "give me next command" for a planned multi-session workflow. See "Auto-Suggest Next Command" before STOP for the full detection + output pattern
22. **Super-Epic child sessions MUST merge the epic-PR into the super-epic base before STOP** — when Super-Epic child mode is active (epic issue body has `**Super-epic:** #N`), the epic-PR is not a "leave-open for user review" PR like the normal root PR. Each epic-PR must land on the super-epic base so the next epic session branches off fresh state and sibling epic-PRs do not collide. Leaving an epic-PR open here means the backlog grows by one PR per session and the super-PR never converges. The "Super-Epic: Merge Epic-PR into Super-Epic Base" step before STOP is mandatory — run it whenever Super-Epic child mode is active. The only exception is `-a` / `--auto`, which merges the PR through `/pr-complete`. This rule OVERRIDES Rule 1's "Stay on `base/<project-name>`" default for the merge action. Normally you stay on the epic base branch afterward — but if Auto-Suggest detects this was the last epic (no open siblings remain), the all-done branch of that step ALSO checks out the super-epic base and pulls, so the user is positioned for the final `/deep-review -t` pass. That additional checkout is intentional and allowed; do not "correct" it back to the epic base.

## Prerequisites

- `worktrees/` in `.gitignore`
- `gh` CLI authenticated
- `git` version 2.15+ (worktree support)
