# Super-Epic Child Mode

Full lifecycle for `/x-wt-teams` sessions that are children of a Super-Epic plan created by `/big-plan` Super-Epic mode. The skill body links here from Step 1a, Step 2, the mandatory merge step, and Auto-Suggest Next Command.

## Detection

A session is a **Super-Epic child** if and only if the input is an `[Epic]` issue (per `/big-plan` epic-shortcut handling) AND the issue body contains all three markers, with these exact spellings:

```
**Super-epic:** #<super-epic-issue-number>
**Super-epic base branch:** `base/<super-title-slug>`
**This epic's base branch:** `base/<super-title-slug>-<epic-slug>`
```

If any marker is missing, treat as a normal epic shortcut (not Super-Epic child mode).

## Variable extraction

Capture these once at the start of Step 1a so later steps don't re-parse:

```bash
# Super-epic issue number — used by the merge step's super-epic comment and Auto-Suggest.
SUPER_EPIC_NUMBER=$(gh issue view "$ISSUE_NUMBER" --json body --jq .body \
  | grep -oE '\*\*Super-epic:\*\* #[0-9]+' | grep -oE '[0-9]+' | head -1)

# Super-epic base branch name — used as parent branch and as the post-merge checkout target.
SUPER_EPIC_BASE=$(gh issue view "$ISSUE_NUMBER" --json body --jq .body \
  | grep -oE '\*\*Super-epic base branch:\*\* `base/[^`]+`' \
  | sed -E 's/.*`base\/([^`]+)`.*/base\/\1/' | head -1)

# This epic's base branch — used verbatim in Step 2 (do not invent a new project name).
EPIC_BASE=$(gh issue view "$ISSUE_NUMBER" --json body --jq .body \
  | grep -oE '\*\*This epic'"'"'s base branch:\*\* `base/[^`]+`' \
  | sed -E 's/.*`base\/([^`]+)`.*/base\/\1/' | head -1)
```

## Step 1a overrides (Super-Epic child)

Apply these on top of the normal epic shortcut handling:

1. **Parent branch** = `$SUPER_EPIC_BASE` (NOT main, NOT the invocation branch, NOT `--stay`). Treat as if the user explicitly passed this base.
2. **Base branch** = `$EPIC_BASE` (the value from `**This epic's base branch:**`). Use verbatim in Step 2 `git checkout -b <that-name>`.
3. **Project name (topic-branch prefix)** = `$EPIC_BASE` with the `base/` prefix stripped, so topic branches become `<super-title-slug>-<epic-slug>/<topic>`.
4. **Topics** — this epic's body lists sub-tasks inline (NOT as separate `[Sub]` issues). Each inline sub-task becomes one topic.
5. **Verify the super-epic base exists on origin** — `/big-plan` Super-Epic mode creates it at S-9. Defensively check:

   ```bash
   git fetch origin
   git show-ref --verify --quiet "refs/remotes/origin/$SUPER_EPIC_BASE" || {
     echo "Super-epic base '$SUPER_EPIC_BASE' does not exist on origin."
     echo "Re-run /big-plan Super-Epic mode (S-9) or create the super-epic anchor manually."
     exit 1
   }
   ```

6. **Claim THIS epic's issue** (not the super-epic — sibling epics run in parallel in other sessions):

   ```bash
   gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\` Super-Epic child). To avoid conflicts, please check the latest comments before starting another session on this epic."
   ```

7. **Do NOT close the super-epic issue** at session end. Only the merge step's comment links to the merged epic-PR. The super-epic stays open until all sibling epic-PRs are merged and the user runs the final `/deep-review -t`.

## Step 2 override (root PR target)

The root PR is the **epic-PR**. Its `--base` MUST be `$SUPER_EPIC_BASE` (NOT main, NOT the invocation branch). This makes the epic-PR a child of the super-PR.

This is the one explicit exception to the top-of-skill "ROOT PR TARGET BRANCH RULE" — Super-Epic child mode is the exception because the parent is determined by the super-epic markers, not by the invocation branch.

## Mandatory: Merge Epic-PR into Super-Epic Base

**Always runs in Super-Epic child mode, regardless of `-a` / `--auto`.** This step replaces the normal "leave the root PR open for the user to review and merge" behavior — the epic-PR MUST be merged before STOP, no exceptions.

**Why mandatory:** A super-epic stacks many epic-PRs on the same super-epic base. If an epic-PR is left open, the next epic session branches off a stale super-epic base — its topics won't include this epic's work, sibling epic-PRs conflict on shared files, the super-PR never converges. With many epics in flight, the backlog of unmerged epic-PRs becomes unrecoverable.

### Step 1: Re-confirm CI is green on the epic-PR

Step 12 already watched CI, but re-check before merging:

```bash
gh pr checks <root-pr-number>
```

If any required check is failing, do NOT merge. Fix using the same pattern as Step 12 (`gh run view --log-failed`, fix, commit, push, re-watch). Do not bypass a red check to satisfy the merge mandate.

### Step 2: Merge the epic-PR

Use a regular merge (NOT squash) — preserves the per-topic merge commit history so the super-PR diff is reviewable per-epic:

```bash
gh pr merge <root-pr-number> --merge --delete-branch
```

`--delete-branch` deletes the remote epic base branch — the work now lives in the super-epic base.

### Step 3: Comment on the super-epic issue

This is how the super-epic tracks progress across child epics:

```bash
EPIC_PR_URL=$(gh pr view <root-pr-number> --json url -q .url)
gh issue comment "$SUPER_EPIC_NUMBER" --body "Epic #$ISSUE_NUMBER merged into the super-epic base: $EPIC_PR_URL"
```

### Step 4: Do NOT close the super-epic issue

It stays open until all sibling epic-PRs are merged.

### Step 5: Switch to super-epic base, delete dead local epic base (MANDATORY)

After the merge, the local epic base is a dead pointer — its remote was just deleted by `--delete-branch`, and its commits already live in the super-epic base. This is an instance of the **Dead Branch Cleanup Principle** (Important Rule 23):

```bash
DEAD_EPIC_BASE=$(git branch --show-current)

git fetch origin --prune
git checkout "$SUPER_EPIC_BASE"
git pull origin "$SUPER_EPIC_BASE"

# Use -d (NOT -D). If unmerged commits exist, surface as a loud failure — do not force.
git branch -d "$DEAD_EPIC_BASE"
```

If `git branch -d` fails, do NOT use `-D`. Stop and investigate — the merge may have been incomplete.

This step OVERRIDES Important Rule 1's general "stay on `base/<project-name>`" default. Justified: the epic base no longer exists meaningfully — it's been folded into the super-epic base.

After this step, proceed to Close Tracking Issue → Auto-Suggest Next Command (Super-Epic variant) → STOP. The user is now on the up-to-date super-epic base, ready for the next sibling epic or the final `/deep-review -t`.

## Auto-Suggest Next Command — Super-Epic variant

Runs after Close Tracking Issue, before STOP. Helps the user pick up the next epic without manually looking up URLs.

### Step 1: List sibling open epics under this super-epic

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh issue list --repo "$REPO" --label epic --state open --limit 200 \
  --json number,title,url,body \
  --jq "[.[] | select(.body | contains(\"**Super-epic:** #$SUPER_EPIC_NUMBER\")) | select(.number != $ISSUE_NUMBER) | {number, title, url}]"
```

Returns OPEN siblings only. Merged epics are closed by `/pr-complete` or the user, so they're naturally excluded.

### Step 2: Pick the next epic

Use the first remaining entry. The super-epic body lists epics in dependency order, and `gh issue list` returns them in creation order (matching `/big-plan`'s creation order). If uncertain about dependency order, fall back to:

```bash
gh issue view "$SUPER_EPIC_NUMBER" --json body --jq .body
```

and pick the earliest-listed open sibling.

### Step 3a: Print the next-epic hand-off (siblings remain)

Use the literal `.url` from `gh issue list` output — do NOT reconstruct URLs.

```
## Super-Epic: Next epic ready

Just finished: #<ISSUE_NUMBER> — merged into <SUPER_EPIC_BASE>
Super-epic:    #<SUPER_EPIC_NUMBER>

Run the next epic in a FRESH session:

    /x-wt-teams <next-epic-url>

Remaining open epics under this super-epic:
1. #<next-number>  <next-title>   ← run next
2. #<other-number> <other-title>
...
```

### Step 3b: Print the all-done hand-off (no siblings remain)

This is the LAST Super-Epic child session.

The user is already on `$SUPER_EPIC_BASE` (merge step 5 did the checkout + pull + delete). Sanity check:

```bash
[ "$(git branch --show-current)" = "$SUPER_EPIC_BASE" ] || \
  echo "WARNING: expected to be on $SUPER_EPIC_BASE; merge step 5 may not have run."
```

Then print:

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

`-t` is `/deep-review`'s default but include it explicitly so the user understands team-fix mode is what makes this safe to run on a large multi-epic diff.

## Why `-a` / `--auto` is ignored in Super-Epic child mode

The mandatory merge above already handles the epic-PR. `-a` is redundant there. Worse, the flag is semantically misleading — a user might read "auto-merge" as "also merge the super-epic base into main / origin branch," which this skill NEVER does (the super-PR is merged later, in a different session, by the user). To prevent that confusion, Super-Epic child sessions do NOT honor `-a`.

If the user passes `-a` in Super-Epic mode, treat it as a no-op and proceed with the mandatory merge step.

## Important rules that ONLY apply in Super-Epic child mode

- **Parent branch is fixed to `$SUPER_EPIC_BASE`**, not the invocation branch — this is the one explicit exception to the top-of-skill ROOT PR TARGET BRANCH RULE.
- **Each epic-PR MUST be merged before STOP.** Skipping the merge breaks the multi-epic stacking strategy.
- **Always switch to the super-epic base and delete the local epic base after the merge** — instance of the Dead Branch Cleanup Principle.
- **`-a` / `--auto` is ignored** — see above.
- **The super-epic issue is never closed by this skill** — it stays open until all siblings are merged and the user does the final `/deep-review -t`.
