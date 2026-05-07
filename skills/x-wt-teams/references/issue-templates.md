# Issue & Comment Templates

Reusable markdown templates for the GitHub-issue artifacts produced by this skill. The skill body links here from Step 1b (create issue), the unrelated-findings rule, the accumulating-epic auto-suggest variant, and Step 14 (session report).

## Tracking issue body (Step 1b — create new issue)

The tracking issue is a **spec tracker**, not just a step log. The Summary section should answer "what are we doing and why?" — enough for someone unfamiliar with the task to understand the scope. Not too detailed (that's for the PR), not too brief (that's useless).

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

## Per-step progress comment

After each step:

1. Check off the step in the issue body's TODO list (`gh issue edit` to update body, change `- [ ]` to `- [x]`).
2. Comment with a brief report:

   ```bash
   gh issue comment "$ISSUE_NUMBER" --body "$(cat <<'EOF'
   ### Step N: <step name> — completed

   <concise summary of what was done, outcome, any issues>
   EOF
   )"
   ```

3. Re-read the issue (`gh issue view "$ISSUE_NUMBER"`) to confirm the next step. This re-read is **critical** — it prevents losing track of remaining steps during long workflows.

## Existing-issue claim comment

Before Step 2, post a claim comment so other Claude Code sessions don't start parallel work on the same issue:

**Non-epic issue:**

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this issue in a Claude Code session (\`/x-wt-teams\`). To avoid conflicts, please check the latest comments before starting another session on this issue."
```

**Epic issue:**

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\`). To avoid conflicts, please check the latest comments before starting another session on this epic."
```

**Super-Epic child epic** (post on THIS epic's issue, not the super-epic):

```bash
gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\` Super-Epic child). To avoid conflicts, please check the latest comments before starting another session on this epic."
```

## Unrelated-findings issue (raise during work)

When a reviewer or agent discovers a problem unrelated to the original topic — pre-existing bug, code smell in adjacent code, outdated dependency, etc. — raise as a separate issue (unless `-noi` / `--no-raise-issues` was passed):

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

When `-noi` / `--no-raise-issues` is active, simply ignore unrelated findings and focus only on the original task. Pass this flag context to child agents so they skip raising too.

## Step 14 session report

Generate a structured report. Two destinations: log directory (for `/logrefer`) and the linked GitHub issue (for human visibility).

**Content:**

- Project name and scope
- Topics implemented (one bullet per topic with brief summary of what each child agent did)
- Key decisions and architectural choices
- Review findings and fixes applied (from `/deep-review`)
- CI status (pass / fail / skipped)
- Root PR URL and topic PR URLs

**Save to log directory:**

```bash
$HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-x-wt-teams-{slug}.md" "<report content>"
```

Where `{slug}` is derived from the project name (e.g., `marker-fix`).

**Post to GitHub issue (if `ISSUE_NUMBER` is set):**

```bash
gh issue comment "$ISSUE_NUMBER" --body "<report content>"
```

## Step 15 requirements-verification comments

**All requirements met:**

```bash
gh issue comment "$ISSUE_NUMBER" --body "All original requirements verified as implemented."
```

**Requirements gap found** (do NOT stop — continue implementation):

```bash
gh issue comment "$ISSUE_NUMBER" --body "### Requirements gap found\n\nMissing: <list of missing items>\n\nContinuing implementation..."
```

After commenting, re-run Steps 3–14 using `--stay` semantics on the existing base branch, then re-run Step 15. Repeat until all original requirements are satisfied.

## Close-tracking-issue comment

When the workflow ends (unless `--no-issue` was used or the user provided the issue):

```bash
gh issue close "$ISSUE_NUMBER" --comment "Workflow complete. Root PR: <ROOT_PR_URL>"
```

If problems were discovered that need follow-up, raise them as **separate issues** before closing the tracking issue. The tracking issue itself should not remain open as a to-do item.

**Exception**: If the user provided the issue (not created by this workflow), do NOT close it.

## Accumulating-epic Auto-Suggest hand-off

For the `--stay` accumulating-epic wave pattern (user runs `/x-wt-teams <sub-issue-url> --stay ...` repeatedly against the same epic base branch). At session end, print this hand-off so the user doesn't have to manually look up the next sub-issue URL.

### Detection (Signal B)

The session was invoked with `-s` / `--stay` AND the user's original instructions contain ANY of:

- "wave" / "Wave N<letter>" / "Sub N" / "next sub" / "next wave"
- "accumulating epic PR" or "Do NOT ... merge PR #NNNN" or "Do NOT run /pr-complete"
- "close the sub-issue" (sequential sub-issue pattern)
- An enumerated list of remaining sub-issues / waves
- The session merged a sub-issue into the epic base and the epic PR stayed open

### Identify epic base & PR

```bash
EPIC_BASE=$(git branch --show-current)   # e.g., base/design-token-panel

# Accumulating epic PR number: parse from user's original instructions
# (phrases like "PR #1440", "merge PR #NNNN", "accumulating epic PR #NNNN").
# If not stated, fall back to: the open PR whose head is EPIC_BASE.
EPIC_PR=$(gh pr list --head "$EPIC_BASE" --state open --json number --jq '.[0].number')
```

### Find remaining sub-issues

In order of preference:

1. Explicit enumerated list in user's original instructions (e.g., "Sub 10a, Sub 10b, Sub 10c — run each in a fresh `--stay` session"). Pick the next one not yet closed.
2. Sub-issues linked from the epic PR body / epic tracking issue. Fetch and filter to open:

   ```bash
   gh pr view "$EPIC_PR" --json body --jq .body
   # Scan for "#NNNN" references; check each with `gh issue view <n> --json state` and keep open ones.
   ```

3. Sibling open issues under the same parent / epic issue (if referenced).

If you cannot confidently identify the next sub-issue, print the no-next-found fallback (below) instead of guessing.

### Hand-off message — next sub ready

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

**Required elements in the printed command:**

- **Same model / backend flags** as this session (e.g., `-gcoc`, `-haiku`, `-co`). Forward whatever was used.
- **`--stay` MUST be present** — accumulating-epic continuation, not a fresh workflow.
- **Wave / sub label** (e.g., "Wave 4b only: Sub 10b #1493 —") if user's original instructions used one; omit otherwise.
- **Explicit "Do NOT run /pr-complete or merge PR #<EPIC_PR> (accumulating epic PR)"** clause so the next session preserves the accumulating pattern.
- **Use the literal issue URL** from `gh` output — do not hand-construct `github.com/...` URLs.

### Hand-off — last sub or next unclear

If no remaining sub-issue can be confidently identified:

```
## Accumulating Epic: Last sub complete (or next sub unclear)

Just finished: #<closed-sub-number> — merged into <EPIC_BASE>
Accumulating epic PR: #<EPIC_PR> (stays open)

Could not auto-detect the next sub-issue. If more waves remain, tell me the next sub-issue URL or point me at the tracking doc. Otherwise, the accumulating epic PR is ready for the final push / merge.
```
