# Super-Epic Child Mode

Full lifecycle for `/x-wt-teams` sessions that are children of a super-epic bundle. The modern producer is **`/big-plan` sweep mode (`-is`)**: a sweep that yields 2+ epics bundles them under one super-epic issue, and each child epic is a normal `/big-plan` epic with real `[Sub]` issues plus the three markers below. (The retired standalone `/big-plan` Super-Epic mode produced epics with inline sub-tasks — that shape is still supported as **legacy**.) The skill body links here from Step 1a, Step 2, the mandatory merge step, and Auto-Suggest Next Command.

## Detection

A session is a **Super-Epic child** if and only if the input is an `[Epic]` issue (per `/big-plan` epic-shortcut handling) AND the issue body contains all three markers, with these exact spellings:

```
**Super-epic:** #<super-epic-issue-number>
**Super-epic base branch:** `base/<super-slug>`
**This epic's base branch:** `base/<super-slug>-<epic-slug>`
```

If any marker is missing, treat as a normal epic shortcut (not Super-Epic child mode).

**Misdirected input:** if the passed issue is the super-epic tracking issue itself (`[Super-Epic]` in the title, or the `super-epic` label), do NOT implement it — read its `## Implementation order` section, print the first still-open child epic as the command to run, and STOP (see SKILL.md Step 1a).

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
4. **Topics** — read them exactly like a normal epic shortcut: each linked `[Sub]` issue becomes one topic, with its own `**Wave:**` / `**Execution mode:**` / `**Model:**` markers and `Depends on:` notes (this is the shape `/big-plan` sweep mode produces). **Legacy format:** if the epic has NO `[Sub]` issues and instead lists sub-tasks inline in its body (the retired standalone Super-Epic producer), each inline sub-task becomes one topic — parse its nested marker bullets. Never mix: if both exist, the `[Sub]` issues win and the inline list is treated as stale prose.
5. **Verify the super-epic base exists on origin** — the `/big-plan` sweep bundle bootstrap creates it as a **branch ref and nothing else**: no commit is made on it (not even an empty one) and no super-PR is opened. The super-PR is deferred to the first epic-PR merge — see [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) below. So a zero-diff super base carrying **no PR** is the normal state for the whole span between the sweep and the first merge, and **the branch ref — never a PR — is the "bootstrap already ran" marker.** Defensively check:

   ```bash
   # --prune is load-bearing: the all-done tail merges the super-PR with `--delete-branch`, and gh
   # does NOT prune remote-tracking refs — a bare `git fetch` would leave a stale
   # origin/$SUPER_EPIC_BASE and this check would pass on a branch that is gone from origin.
   git fetch origin --prune

   if ! git show-ref --verify --quiet "refs/remotes/origin/$SUPER_EPIC_BASE"; then
     # An ABSENT super base is also the NORMAL state after a successful terminal merge (all-done
     # step 4 deletes it). So distinguish "never bootstrapped" from "already finished" — aborting on
     # both would make the idempotent all-done tail unreachable, permanently stranding a batch that
     # crashed between the super-PR merge and the close/CI-watch/cleanup steps.
     MERGED_SUPER_PR=$(gh pr list --head "$SUPER_EPIC_BASE" --state merged --limit 1 \
       --json url --jq '.[0].url // empty')
     if [ -n "$MERGED_SUPER_PR" ]; then
       echo "Super-PR already merged ($MERGED_SUPER_PR) — resuming the all-done tail."
     else
       echo "Super-epic base '$SUPER_EPIC_BASE' does not exist on origin."
       echo "Re-run the /big-plan -is sweep bundle bootstrap, or recreate the super base by hand."
       echo "Branch + push ref ONLY — no commit on it, and no PR (the super-PR opens after the"
       echo "first epic-PR merges; see 'Ensure the super-PR exists'):"
       echo "  git checkout <parent> && git pull origin <parent> && git checkout -b $SUPER_EPIC_BASE && git push -u origin $SUPER_EPIC_BASE"
       exit 1
     fi
   fi
   ```

   **If `$MERGED_SUPER_PR` is non-empty, the batch is already implemented and merged — only the tail
   was lost.** Skip every remaining Step 1a override, Step 2, and the whole implementation pipeline.
   Go straight to the Auto-Suggest **all-done branch ("With `-m`")** and run it from step 0: it is
   idempotent, so step 1 sees the merged super-PR and jumps to the tail (close the super-epic, watch
   CI on `$SUPER_PARENT`, delete the local super base). Do **not** recreate the super base — the
   base-recreation advice above is only for the never-bootstrapped case. Capture the target from
   the merged PR: `SUPER_PARENT=$(gh pr view "$MERGED_SUPER_PR" --json baseRefName -q .baseRefName)`.

6. **Resume check — this epic may be half-done** (a crashed chain is resumed by re-running its printed command, so a partially-run epic is a NORMAL state, not an error). Before Step 2 creates anything, look for the leftovers of a previous attempt:

   ```bash
   # --prune: a crashed merge step may leave a stale origin/$EPIC_BASE ref (the remote branch was
   # deleted by `gh pr merge --delete-branch`; a bare `git fetch` does not notice).
   git fetch origin --prune

   # (a) Did a previous attempt already MERGE this epic-PR? The PR record survives --delete-branch.
   MERGED_EPIC_PR=$(gh pr list --head "$EPIC_BASE" --state merged --limit 1 --json url --jq '.[0].url // empty')

   # (b) Half-done: base (LOCAL or remote — a crash before the first push leaves only a local one)
   #     and/or an OPEN epic-PR left behind
   git show-ref --verify --quiet "refs/remotes/origin/$EPIC_BASE" && echo "epic base exists on origin"
   git show-ref --verify --quiet "refs/heads/$EPIC_BASE"          && echo "epic base exists locally"
   gh pr list --head "$EPIC_BASE" --state open --json number,url
   ```

   Branch on the **first** match:

   1. **Epic issue already CLOSED** → done and signalled. Do not re-implement. Tidy up as branch 2 does: run [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) (this epic's work is already in the super base, so the PR may be creatable but missing — the crash could have landed anywhere after the merge); close any still-open `[Sub]` issues of this epic; **always** `git checkout "$SUPER_EPIC_BASE" && git pull origin "$SUPER_EPIC_BASE"` (the chain must continue from the super base, whether or not a stale local epic base exists), and delete that leftover base if present (`git branch -d "$EPIC_BASE" 2>/dev/null || true`). Then go to Auto-Suggest.
   2. **`$MERGED_EPIC_PR` non-empty but the issue is still OPEN** → **the epic is DONE; the crash only lost the post-merge signals.** This is the exact window between merge sub-steps 2 and 4 — which now spans the super-PR's creation point (sub-step 2.5), so the **super-PR may be missing as well as the comments**. Do NOT recreate the base, re-run topics, or `gh pr create` the **epic**-PR (it would die on "No commits between base and head" — the work is already in the super base). Replay only the missing signals — merge sub-steps 2.5, 3, 4 and 6:

      First run [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) — it is idempotent, so an already-open (or already-recorded) super-PR costs one `gh issue view`. Then:

      ```bash
      EPIC_PR_URL="$MERGED_EPIC_PR"
      gh issue comment "$SUPER_EPIC_NUMBER" --body "Epic #$ISSUE_NUMBER merged into the super-epic base: $EPIC_PR_URL"
      gh issue comment "$ISSUE_NUMBER" --body "Epic-PR merged into \`$SUPER_EPIC_BASE\`: $EPIC_PR_URL"
      gh issue close "$ISSUE_NUMBER"

      git checkout "$SUPER_EPIC_BASE" && git pull origin "$SUPER_EPIC_BASE"
      git branch -d "$EPIC_BASE" 2>/dev/null || true    # -d never -D; already-absent is fine
      ```

      Also close this epic's `[Sub]` issues (whose topics all merged) — normally Step 16's audit does that, and this path skips Step 16. Then go straight to **Auto-Suggest**. A duplicate super-epic comment is harmless; a re-implemented epic is not.
   3. **The epic base (local and/or remote) and/or an OPEN epic-PR exist** → **reuse what exists, create only what is missing.** The three probe signals are independent, and a crash can leave any combination — so branch on each:

      - **Local base but no remote** (crashed before the first push): `git checkout "$EPIC_BASE"`, then `git push -u origin "$EPIC_BASE"`.
      - **Remote base** (with or without a local copy): `git checkout "$EPIC_BASE" 2>/dev/null || git checkout -b "$EPIC_BASE" "origin/$EPIC_BASE"`, then `git pull origin "$EPIC_BASE"`. Never plain `git checkout -b "$EPIC_BASE"` — it fails on an existing branch.

      **An open epic-PR is NO LONGER the "the branch was bootstrapped" marker.** Step 2 creates and pushes the epic base and stops; the epic-PR opens in **Step 11**, once the base carries topic work. So "epic base exists, no epic-PR" is exactly what a *healthy* fresh bootstrap leaves behind, and reading it as "the PR is missing, create it now" would fire `gh pr create` at a zero-diff branch and fail. Classify from the **branch** instead — the same three-way shape `SKILL.md` Step 1.5a applies to the root PR. Compare against the **remote** super base: a stale local `$SUPER_EPIC_BASE` would make a zero-diff epic base look ahead.

      ```bash
      git rev-list --count "origin/$SUPER_EPIC_BASE..$EPIC_BASE"      # 0 = level with the super base, >0 = ahead
      gh pr list --head "$EPIC_BASE" --state open --json number,url   # PR evidence, second
      ```

      | epic base vs. `origin/$SUPER_EPIC_BASE` | open epic-PR? | Meaning | Action |
      |---|---|---|---|
      | equal (0 ahead) | no | **Healthy fresh bootstrap** — Step 2 completed, no topic work has landed yet | Continue below. Do **NOT** `gh pr create` — it fails on a zero-diff branch, and nothing is missing |
      | ahead | no | Topic work landed but the run died before Step 11 opened the epic-PR | Push the base if the remote is behind, then let Step 11's create-if-absent block open it with `--base "$SUPER_EPIC_BASE"` |
      | either | yes | A previous run reached Step 11 | Adopt it as this run's root PR; do NOT `gh pr create` (it fails on a duplicate) |

      **This row set is about the EPIC-PR only.** The super-PR is a different artifact with a different creation point and its own idempotent guard — see [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this). Never let a decision about one drive the other.

      Then clear the dead session's worktrees — `git worktree prune`, and `git worktree remove` any leftover the prune keeps. A stale worktree holds its topic branch "checked out", which blocks re-creating or re-merging that topic. **Before removing any leftover, apply `SKILL.md` Step 1.5b's classification** (`git -C <wt> status --short`): a dead child may have left uncommitted work there. Adopt it via Step 1.5c — validate, commit, then spawn a replacement child to self-review and file the completion report Step 6's gate requires. `git worktree remove` refusing without `--force` is the signal to do that; never `--force` past the refusal.

      Now decide **per topic from the epic base's own merge history — never from `[Sub]` issue state**: sub-issues are closed by the Step 16 cleanup audit, which runs *after* the epic-PR merge, so in this window (epic-PR still open) **no sub has ever been closed** and a "skip the closed ones" rule would skip nothing and re-run every finished topic.

      ```bash
      PROJECT_NAME="${EPIC_BASE#base/}"
      for topic in <planned topics>; do
        TB="$PROJECT_NAME/$topic"
        # -F and the CLOSING QUOTE are both load-bearing: git's default merge message is
        # `Merge branch '<TB>' into <base>`, so "'$TB'" is an exact, delimited match. A bare
        # --grep "$TB" is an unanchored regex — topic `auth` would match the merge commit of
        # `auth-fix`, be marked SKIP, never run, and silently vanish from the epic.
        if git log --merges --oneline "$EPIC_BASE" --grep "'$TB'" -F | grep -q .; then
          echo "SKIP  $topic — already merged into $EPIC_BASE"
        elif git rev-parse --verify --quiet "refs/heads/$TB" >/dev/null; then
          # A branch exists but was never merged. It may be a FINISHED child whose merge never ran,
          # or a child that died mid-work (or never committed at all). Never assume "finished" from
          # existence alone — merging an incomplete branch ships a half-done topic silently.
          echo "INSPECT $topic — unmerged branch $TB: $(git rev-list --count "$EPIC_BASE..$TB") commit(s) ahead"
        else
          echo "RUN   $topic"
        fi
      done
      ```

      For each **INSPECT** topic, read its `[Sub]` issue's acceptance criteria and diff the branch
      against the epic base (`git diff "$EPIC_BASE...$TB"`). If the work is complete, merge it at
      Step 6 (`--no-ff`) and do not respawn. If it is empty or partial, delete the branch and treat
      the topic as **RUN** — a fresh child re-does it cleanly. When in doubt, prefer RUN: re-doing a
      finished topic is wasteful, but merging a half-finished one is a silent correctness bug.

      **Never respawn a child for a SKIP topic** — its worktree would fork from a base that already contains its own work, producing duplicate or contradictory edits. If every topic is SKIP, the topic phase is done: go to Step 9 (review) → **Step 11 (push, and open the epic-PR if the table above found none — that block is create-if-absent / adopt-if-present)** → Step 12 (CI) → **Step 13 (mark the epic-PR ready — a draft PR cannot be merged)** → the mandatory merge. (This read-back depends on Step 6 merging topics with `--no-ff`: topic branches are deleted at Step 11, so the named merge commit is the only durable record that a topic landed.)
   4. **Nothing found** (no merged PR, no local or remote epic base, no open epic-PR) → normal Step 2 creation (the epic **branch**; its PR still waits for Step 11 like every other mode).

7. **Claim THIS epic's issue** (not the super-epic — sibling epics run in parallel in other sessions):

   ```bash
   gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\` Super-Epic child). To avoid conflicts, please check the latest comments before starting another session on this epic."
   ```

8. **Do NOT close the super-epic issue** at session end — with one exception: the **terminal sibling** (no open siblings remain) that merges the super-PR under `-m` closes it with a completion comment (see "All-done branch" below). Mid-chain, only the merge step's comment links to the merged epic-PR; the super-epic stays open until all sibling epic-PRs are merged. (THIS epic's own issue IS closed — by the mandatory merge step, Step 4. Don't confuse the two.)

## Step 2 override (root PR target — the epic-PR, created in Step 11)

The root PR is the **epic-PR**. Its `--base` MUST be `$SUPER_EPIC_BASE` (NOT main, NOT the invocation branch). This makes the epic-PR a child of the super-PR.

**The override is on the target, not on the timing.** Step 2 creates and pushes `$EPIC_BASE` and records `$SUPER_EPIC_BASE` as its parent; `gh pr create` runs in **Step 11**, at the same deferred point as every other mode, where the `!! PR TARGET CHECK !!` guard consumes the recorded value. There is no empty start commit to open the PR against earlier, and none may be fabricated to restore one.

This is the one explicit exception to the top-of-skill "ROOT PR TARGET BRANCH RULE" — Super-Epic child mode is the exception because the parent is determined by the super-epic markers, not by the invocation branch.

## Ensure the super-PR exists (idempotent — every path routes through this)

**The sweep does not open the super-PR; this file does.** `/big-plan`'s sweep bootstrap creates the super base as a zero-diff branch ref and stops — `gh pr create` cannot open a PR whose head is level with its base, and the empty `[skip ci]` anchor commit that used to make one possible is the exact defect this topology removes. The super-PR's creation point is **after the first epic-PR merges into the remote super base** — the first moment the base is genuinely ahead of its parent — and the sibling that performed that merge creates it (`skills/big-plan/references/issue-sweep.md` Step 3, "The deferred super-PR", owns the PR's shape).

**"No super-PR yet" is a normal, resumable state**, not evidence that the bootstrap never ran. Every path below runs the same block, which is safe to re-run any number of times:

- the **mandatory merge**, sub-step 2.5 — the creation point;
- **every resume path** — Step 1a resume branches 1 and 2, including a crash after the epic merge but before the issue close;
- the **all-done hand-off**, both with and without `-m` — and in the `-m` sequence it runs *before* `gh pr ready`, which must never be reached with an absent PR.

**Contract:** the block sets `$SUPER_PR_URL`. An **empty** `$SUPER_PR_URL` means "not creatable yet" — the super base is still level with its parent, or is gone from origin — and is a success, not a failure. Callers that need a PR must check it and stop with a message rather than proceed.

**Shell state does not survive between commands.** A caller that uses `$SUPER_PR_URL` in a later block must either run that block in the same command as this one, or re-read the value from the super-epic body's `**Super-PR:**` line — which is precisely why the block records it there.

```bash
# Every value is re-derived from the issue markers: the sweep session that set them ended long
# before this runs, and no shell state survives between the sessions that call this.
# $SUPER_EPIC_BASE and $SUPER_EPIC_NUMBER come from Step 1a's Variable extraction.
[ -n "$SUPER_EPIC_BASE" ]   || { echo "SUPER_EPIC_BASE unset — abort"; exit 1; }
[ -n "$SUPER_EPIC_NUMBER" ] || { echo "SUPER_EPIC_NUMBER unset — abort"; exit 1; }

git fetch origin --prune

# tr -d '\r': GitHub returns issue bodies with CRLF line endings, and a trailing \r would ride
# into $SUPER_PR_URL and into every gh call made with it.
SUPER_EPIC_BODY=$(gh issue view "$SUPER_EPIC_NUMBER" --json body --jq .body | tr -d '\r')

# The PARENT branch lives on the super-epic issue, not on this epic's markers.
SWEEP_PARENT_BRANCH=$(printf '%s\n' "$SUPER_EPIC_BODY" \
  | grep -oE '\*\*Parent branch:\*\* `[^`]+`' | sed -E 's/.*`([^`]+)`.*/\1/' | head -1)
[ -n "$SWEEP_PARENT_BRANCH" ] || { echo "no **Parent branch:** marker on #$SUPER_EPIC_NUMBER — abort"; exit 1; }
# The ahead/level comparison below is `git rev-list` against origin/$SWEEP_PARENT_BRANCH — an
# absent ref there fails the command mid-`[ ]` and would read as "level", i.e. "no PR needed".
git show-ref --verify --quiet "refs/remotes/origin/$SWEEP_PARENT_BRANCH" \
  || { echo "origin/$SWEEP_PARENT_BRANCH is gone — the bundle's parent branch must exist; abort"; exit 1; }

# (a) Already recorded? That line names THIS bundle's PR unambiguously — always prefer it over a
#     --head lookup, which can match a previous bundle that recycled the same base name.
SUPER_PR_URL=$(printf '%s\n' "$SUPER_EPIC_BODY" \
  | grep -E '^\*\*Super-PR:\*\*' | grep -oE 'https://[^ )>]+' | head -1)

if [ -n "$SUPER_PR_URL" ]; then
  # A recorded URL that heads some OTHER branch means a hand-edited body or a recycled slug.
  # Refuse: the terminal sequence would otherwise ready-and-merge a foreign PR.
  [ "$(gh pr view "$SUPER_PR_URL" --json headRefName -q .headRefName)" = "$SUPER_EPIC_BASE" ] || {
    echo "recorded super-PR $SUPER_PR_URL does not head $SUPER_EPIC_BASE — stop and investigate"; exit 1; }
  echo "super-PR $SUPER_PR_URL ($(gh pr view "$SUPER_PR_URL" --json state -q .state))"

elif ! git show-ref --verify --quiet "refs/remotes/origin/$SUPER_EPIC_BASE"; then
  # Nothing recorded AND no branch to open a PR from. Either already merged and cleaned up, or
  # never bootstrapped — Step 1a override 5 distinguishes those two. Never create here.
  echo "no origin/$SUPER_EPIC_BASE and no recorded super-PR — nothing to create"

else
  SUPER_PR_URL=$(gh pr list --head "$SUPER_EPIC_BASE" --state open --limit 1 --json url --jq '.[0].url // empty')
  if [ -n "$SUPER_PR_URL" ]; then
    : # (b) Created, but a crash landed between `gh pr create` and the body write. Adopt + record.
  elif [ "$(git rev-list --count "origin/$SWEEP_PARENT_BRANCH..origin/$SUPER_EPIC_BASE")" -eq 0 ]; then
    # (c) Zero-diff super base — the normal state for the whole span between the sweep bootstrap
    #     and the first epic-PR merge. `gh pr create` would fail here. "Not yet" is success.
    echo "super base is still level with $SWEEP_PARENT_BRANCH — no super-PR yet (expected)"
  else
    # (d) The base is genuinely ahead: create it. The PRODUCER owns the PR's shape — run the block
    #     under "The deferred super-PR — created by /x-wt-teams, not here" in
    #     skills/big-plan/references/issue-sweep.md Step 3 VERBATIM. It re-derives SWEEP_SLUG,
    #     composes the body in a file, guards the `Super-epic: #N` link, and creates a --draft PR.
    #     Its opening lines are placeholder assignments (`SUPER_BASE=<the epic's … marker>`,
    #     `SWEEP_PARENT_BRANCH=<…>`, `SUPER_EPIC_NUMBER=<…>`) meant to be filled in by the
    #     caller — running them literally would overwrite the values resolved above with
    #     placeholder text. Substitute those three lines with the values already in hand:
    SUPER_BASE="$SUPER_EPIC_BASE"
    # (SWEEP_PARENT_BRANCH and SUPER_EPIC_NUMBER are already set above — do not re-assign.)
    # …then run the REST of the producer's block unmodified…
    SUPER_PR_URL=$(gh pr list --head "$SUPER_EPIC_BASE" --state open --limit 1 --json url --jq '.[0].url // empty')
    [ -n "$SUPER_PR_URL" ] || { echo "super-PR creation left no open PR on $SUPER_EPIC_BASE — abort"; exit 1; }
  fi
fi

# Record the URL on the super-epic issue — a read-modify-write replacing the `pending` placeholder.
# Skipped when the body already names it, so re-runs are free.
if [ -n "$SUPER_PR_URL" ] && ! printf '%s\n' "$SUPER_EPIC_BODY" | grep -qF "$SUPER_PR_URL"; then
  NEW_BODY=$(mktemp)
  # Re-read rather than reusing $SUPER_EPIC_BODY: other steps append to this body, and composing
  # an edit from a stale copy silently drops whatever they added.
  gh issue view "$SUPER_EPIC_NUMBER" --json body --jq .body | tr -d '\r' > "$NEW_BODY"
  # `|` delimiter — the URL is full of slashes. -i.bak is the portable in-place form (BSD + GNU).
  sed -i.bak -E "s|^\*\*Super-PR:\*\*.*|**Super-PR:** $SUPER_PR_URL|" "$NEW_BODY" && rm -f "$NEW_BODY.bak"
  grep -qF "$SUPER_PR_URL" "$NEW_BODY" || {
    # No placeholder line — a super-epic issue created before the deferral. APPEND rather than
    # abort: the PR already exists, and aborting here would halt the chain over bookkeeping while
    # losing the one string every later session uses to find this bundle's PR.
    printf '\n**Super-PR:** %s\n' "$SUPER_PR_URL" >> "$NEW_BODY"; }
  gh issue edit "$SUPER_EPIC_NUMBER" --body-file "$NEW_BODY"
fi
```

## Mandatory: Merge Epic-PR into Super-Epic Base

**Always runs in Super-Epic child mode, regardless of `-m` / `--merge`.** This step replaces the normal "leave the root PR open for the user to review and merge" behavior — the epic-PR MUST be merged before STOP, no exceptions.

**Why mandatory:** A super-epic stacks many epic-PRs on the same super-epic base. If an epic-PR is left open, the next epic session branches off a stale super-epic base — its topics won't include this epic's work, sibling epic-PRs conflict on shared files, the super-PR never converges. With many epics in flight, the backlog of unmerged epic-PRs becomes unrecoverable.

### Step 1: Re-confirm CI is green on the epic-PR

`<root-pr-number>` here is the **epic**-PR — the one Step 11 opened and Step 13 flipped ready. The super-PR has its own ready-flip and its own CI re-check, in the terminal `-m` sequence; the two are never interchangeable, and at this moment the super-PR may not exist at all.

Step 12 watched CI while the epic-PR was still a **draft** — on a repo whose workflows skip drafts it correctly found no checks and moved on. Step 13's `gh pr ready` may only NOW be triggering the first runs, so **wait** rather than sample:

```bash
gh pr checks <root-pr-number> --watch
```

**Do not read "no checks reported" as green** — re-poll, and only conclude "this repo has no PR checks" after it stays empty. A one-shot sample taken seconds after the ready-flip reports "no checks" before the newly-triggered runs register, and merges an ungated epic into the super base: every later sibling then forks from a broken base, and the terminal super-PR merge fails CI with the whole batch already stacked on top.

If any required check is failing, do NOT merge. Fix using the same pattern as Step 12 (`gh run view --log-failed`, fix, commit, push, re-watch). Do not bypass a red check to satisfy the merge mandate.

### Step 2: Merge the epic-PR

Use a regular merge (NOT squash) — preserves the per-topic merge commit history so the super-PR diff is reviewable per-epic:

```bash
gh pr merge <root-pr-number> --merge --delete-branch
```

`--delete-branch` deletes the remote epic base branch — the work now lives in the super-epic base.

### Step 2.5: Ensure the super-PR exists (the super-PR's creation point)

The merge above is the moment the super base first goes ahead of its parent, so it is the first moment a super-PR can be opened. Run [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) now.

In the **first** sibling of a bundle this creates the draft super-PR and records its URL on the super-epic issue; in every later sibling it reads the recorded URL back and does nothing. Do not skip it as "surely an earlier sibling did it" — a sibling that crashed between its own merge and this step leaves the bundle with merged work and no PR, and nothing else in the chain would notice until the terminal sequence.

(Numbered 2.5 rather than renumbering: the surrounding text, and `SKILL.md`, refer to these sub-steps by number.)

### Step 3: Comment on the super-epic issue

This is how the super-epic tracks progress across child epics:

```bash
EPIC_PR_URL=$(gh pr view <root-pr-number> --json url -q .url)
gh issue comment "$SUPER_EPIC_NUMBER" --body "Epic #$ISSUE_NUMBER merged into the super-epic base: $EPIC_PR_URL"
```

### Step 4: Close THIS epic's issue (MANDATORY — it is the chain's termination signal)

```bash
gh issue comment "$ISSUE_NUMBER" --body "Epic-PR merged into \`$SUPER_EPIC_BASE\`: $EPIC_PR_URL"
gh issue close "$ISSUE_NUMBER"
```

**`open` ⇔ `not yet implemented` is the invariant the whole chain rides on.** Auto-Suggest picks the next sibling as "the first entry in `## Implementation order` whose issue is still OPEN", and the chain terminates when none are. If a merged epic stays open, the chain re-picks it forever — re-implementing finished work against a base branch that no longer exists. Nothing else closes it: the mandatory merge above is a raw `gh pr merge` (not `/pr-complete`), and the epic-PR body carries no `Closes #N` keyword (nor would GitHub honor one — the PR merges into the super base, not the default branch).

This is a deliberate exception to Rule 27 (cleanup-resources owns end-of-workflow closes) — the same class as the `-fix` step's closes. It MUST happen here, before Auto-Suggest runs; the Step 16 audit only confirms KEEP-as-closed.

### Step 5: Do NOT close the super-epic issue (mid-chain)

It stays open until all sibling epic-PRs are merged. (If THIS session turns out to be the terminal sibling and `-m` rode the chain, the all-done branch below closes it after merging the super-PR — never close it here.)

### Step 6: Switch to super-epic base, delete dead local epic base (MANDATORY)

After the merge, the local epic base is a dead pointer — its remote was just deleted by `--delete-branch`, and its commits already live in the super-epic base. This is an instance of the **Dead Branch Cleanup Principle** (Important Rule 26):

```bash
# NEVER re-derive this from `git branch --show-current`: by now the merge (and any nested
# --stay review session or CI fix) may have moved HEAD elsewhere, and `git branch -d` will
# happily delete a branch that is an ancestor of the super base — including `main` or the
# sweep parent. The only correct value is $EPIC_BASE, captured verbatim back in Step 1a.
DEAD_EPIC_BASE="$EPIC_BASE"

# Hard guard: refuse anything that is not this epic's own base.
case "$DEAD_EPIC_BASE" in
  ""|"$SUPER_EPIC_BASE"|main|master)
    echo "REFUSING: '$DEAD_EPIC_BASE' is not an epic base — aborting dead-branch cleanup"; exit 1 ;;
  base/*) : ;;
  *)
    echo "REFUSING: '$DEAD_EPIC_BASE' is not a base/* branch — aborting dead-branch cleanup"; exit 1 ;;
esac

git fetch origin --prune
git checkout "$SUPER_EPIC_BASE"
git pull origin "$SUPER_EPIC_BASE"

if git show-ref --verify --quiet "refs/heads/$DEAD_EPIC_BASE"; then
  # -d (NOT -D). A refusal here means unmerged commits — a loud failure, never force past it.
  git branch -d "$DEAD_EPIC_BASE" || {
    echo "unmerged commits on $DEAD_EPIC_BASE — the merge may be incomplete; stop and investigate"; exit 1; }
fi
```

An **already-absent** local epic base is expected, not a failure (`gh pr merge --delete-branch` may have removed it along with the remote). A `git branch -d` **refusal** is the real signal: do NOT use `-D` — stop and investigate, the merge may have been incomplete.

This step OVERRIDES Important Rule 1's general "stay on `base/<project-name>`" default. Justified: the epic base no longer exists meaningfully — it's been folded into the super-epic base.

After this step, proceed to Step 15.5 (auto-fix) → Step 16 (`/cleanup-resources` audit) → Auto-Suggest Next Command (Super-Epic variant) → STOP. The user is now on the up-to-date super-epic base, ready for the next sibling epic or the final `/deep-review -t`.

## Auto-Suggest Next Command — Super-Epic variant

Runs after Step 16 (`/cleanup-resources` audit), before STOP. Helps the user pick up the next epic without manually looking up URLs.

### Step 1: List sibling open epics under this super-epic

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh issue list --repo "$REPO" --label epic --state open --limit 200 \
  --json number,title,url,body \
  --jq "[.[] | select(.body | contains(\"**Super-epic:** #$SUPER_EPIC_NUMBER\")) | select(.number != $ISSUE_NUMBER) | {number, title, url}]"
```

Returns OPEN siblings only — use this **for existence-filtering, never for ordering** (`gh issue list` sorts newest-first, NOT creation order). Merged epics were closed by their own mandatory merge step (Step 4), so they are naturally excluded. **If a merged epic still shows up here, its merge step did not finish — investigate and close it; never re-implement it.**

**Match the marker exactly, not as a loose substring.** `contains("**Super-epic:** #45")` also matches `#456` / `#450`, so a repo with more than one super-epic can leak a foreign epic into this list (and a false sibling would keep the chain from ever reaching its terminal step). Anchor the number:

```bash
  --jq "[.[] | select(.body | test(\"\\\\*\\\\*Super-epic:\\\\*\\\\* #$SUPER_EPIC_NUMBER(\\\\D|$)\")) | select(.number != $ISSUE_NUMBER) | {number, title, url}]"
```

### Step 2: Pick the next epic — `## Implementation order` is authoritative

Read the super-epic body and use its `## Implementation order` section (one numbered line per child epic, written by the `/big-plan` sweep producer) as the PRIMARY order source:

```bash
gh issue view "$SUPER_EPIC_NUMBER" --json body --jq .body
```

Pick the first entry in that list whose issue is still OPEN (intersect with the Step 1 result). **Legacy fallback** (no `## Implementation order` section): pick the open sibling with the LOWEST issue number (ascending number ≈ creation order); never trust `gh issue list` output order.

### Step 3a: Print the next-epic hand-off (siblings remain)

Use the literal `.url` from `gh issue list` output — do NOT reconstruct URLs.

**The printed command MUST carry this session's flags** — `-a` (so a resumed chain keeps chaining), `-m` (so the terminal sibling still merges the super-PR), and any `-nf` / `-nori` / `-lo`. This printed line is the *only* hop mechanism when `-a` is not auto-invoking, and it is the artifact a user pastes to resume after a crash: dropping the flags silently converts an autonomous batch into a one-epic manual run that stops at an unmerged super-PR. Omit only the flags that were not passed.

```
## Super-Epic: Next epic ready

Just finished: #<ISSUE_NUMBER> — merged into <SUPER_EPIC_BASE>
Super-epic:    #<SUPER_EPIC_NUMBER>

Run the next epic in a FRESH session:

    /x-wt-teams -a -m <next-epic-url>      # carry forward every flag this session had

Remaining open epics under this super-epic:
1. #<next-number>  <next-title>   ← run next
2. #<other-number> <other-title>
...
```

### Step 3b: Print the all-done hand-off (no siblings remain)

This is the LAST Super-Epic child session.

The user is already on `$SUPER_EPIC_BASE` (merge step 6 did the checkout + pull + delete). Sanity check:

```bash
[ "$(git branch --show-current)" = "$SUPER_EPIC_BASE" ] || \
  echo "WARNING: expected to be on $SUPER_EPIC_BASE; merge step 6 may not have run."
```

Then branch on whether `-m` rode the chain.

**Without `-m` — print and STOP (the super-PR stays open):**

Run [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) **before printing**, and print the `$SUPER_PR_URL` it returns literally. Every epic has merged by now, so the super base is ahead of its parent and the PR is creatable — but this session may be a resumed one whose predecessor died before sub-step 2.5, and handing the user a base branch with no PR and no instructions for making one is exactly the dead end this step exists to prevent. In the rare case `$SUPER_PR_URL` comes back empty, print the reason the ensure step gave instead of a URL, and say the super base still needs a PR.

```
## Super-Epic: All epics complete

Super-epic: #<SUPER_EPIC_NUMBER>
Super-PR:   <SUPER_PR_URL>
All child epics have been merged into <SUPER_EPIC_BASE>.

You are now on <SUPER_EPIC_BASE> (super-epic root branch). The super-PR collects
the whole batch and is waiting for a final quality pass before being merged into
<parent branch>.

Run this in a FRESH session to do the final review-and-fix:

    /deep-review -t

That review covers the full super-epic diff, finds quality issues across all the
merged epic work, and applies fixes via a fresh agent team merging back into
<SUPER_EPIC_BASE>. Once the review pass is clean, take the super-PR out of draft
(`gh pr ready <SUPER_PR_URL>` — it is opened as a draft so it cannot merge while
epic-PRs are still stacking onto the base) and merge it into <parent branch>.

⚠️ Merge these FIRST — they target <SUPER_EPIC_BASE>, and merging the super-PR
   deletes that branch, which would auto-close them UNMERGED (their work is lost):
   <list every open PR from `gh pr list --base <SUPER_EPIC_BASE> --state open`,
    or write "none" — chiefly agent-fix PRs from the auto-fix step>

The super-PR URL is also recorded on the super-epic issue.
```

`-t` is `/deep-review`'s default but include it explicitly so the user understands team-fix mode is what makes this safe to run on a large multi-epic diff.

**With `-m` — this terminal sibling merges the super-PR (deferred `-m` fires here):**

**This sequence must be idempotent** — a crash inside it is resumed by re-running the same command, and every step below is re-entrant: check the current state first and skip what is already done (the super-PR may **not exist yet**, or already be out of draft, already be merged; the super-epic may already be closed, the base already gone). Never treat "already done" as an error — and never treat "does not exist yet" as one either: step 1 creates it.

0. **Verify nothing still targets the super base.** Step 4 deletes it; any PR still open against it would be auto-closed **unmerged** — silently discarding an `agent-fix` PR from Step 15.5, or a sibling epic-PR the chain thinks it merged:

   ```bash
   OPEN_AGAINST_BASE=$(gh pr list --base "$SUPER_EPIC_BASE" --state open --json number,url --jq 'length')
   [ "$OPEN_AGAINST_BASE" -eq 0 ] || {
     echo "PRs still open against $SUPER_EPIC_BASE — merge or close them before the super-PR merge:"
     gh pr list --base "$SUPER_EPIC_BASE" --state open --json number,url --jq '.[].url'
     exit 1; }
   ```

   This is the enforcement behind the ordering rule (fix PRs merge at Step 15.5, before Step 16 and this branch). Ordering alone is not a guarantee — a fix PR whose CI never went green is still open here, and would otherwise be destroyed by the merge.

1. **Ensure the super-PR exists, then locate it.** Run [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) — it is the single create-or-adopt point, and running it here covers the sibling that crashed between its epic merge and sub-step 2.5, which would otherwise leave this sequence with merged work and no PR to ready. It resolves `$SUPER_PR_URL` from the super-epic body's `**Super-PR:**` line when set (that line names *this* bundle's PR unambiguously) and from `gh pr list --head "$SUPER_EPIC_BASE" --state open` otherwise.

   Then capture the target: `SUPER_PARENT=$(gh pr view "$SUPER_PR_URL" --json baseRefName -q .baseRefName)`. **If THAT PR's own state is already MERGED** (`gh pr view "$SUPER_PR_URL" --json state -q .state`), a previous attempt got this far — skip to step 5 (close the super-epic) and finish the tail.

   **Never conclude "already merged" from a bare `--head` list.** PR records outlive `--delete-branch`, so a later sweep that recycled this base name would match the *previous* bundle's merged super-PR — and this session would close its super-epic without ever merging its own super-PR, stranding a whole batch of merged epic work behind a still-draft PR. Always resolve to a specific PR, then read that PR's state. (The ensure step enforces this: it prefers the recorded URL, and asserts that URL heads `$SUPER_EPIC_BASE`. The sweep's slug-collision loop also probes PR history to stop the recycling in the first place; these are the second and third lines of defense.)
2. **Take the super-PR out of draft — do this FIRST.** It is created `--draft` deliberately: a draft can't be merged while sibling epic-PRs are still stacking onto the super base. GitHub refuses to merge a draft PR, so without this the whole autonomous batch dies at its final step:

   ```bash
   # A missing PR must never reach `gh pr ready`: with no argument gh falls back to the CURRENT
   # BRANCH's PR, so an unset URL here would flip some unrelated PR out of draft.
   [ -n "$SUPER_PR_URL" ] || {
     echo "no super-PR — the ensure step in step 1 said why (base level with its parent, or gone"
     echo "from origin). If the base is gone, this bundle may already be merged: check with Step 1a"
     echo "override 5's probe (gh pr list --head \"\$SUPER_EPIC_BASE\" --state merged) and, if it"
     echo "finds one, resume at step 5 instead. Otherwise stop and report."; exit 1; }

   # Idempotent: a resumed run finds it already out of draft, which is success, not an error.
   [ "$(gh pr view "$SUPER_PR_URL" --json isDraft -q .isDraft)" = "false" ] || gh pr ready "$SUPER_PR_URL"
   ```

   (Optionally run `/pr-revise` on it first so its body describes the full multi-epic diff.)
3. Re-check CI on the super-PR. The ready-flip may only now be triggering the first runs (many workflows skip drafts), so **wait** rather than sample: `gh pr checks "$SUPER_PR_URL" --watch`. **Do not read "no checks reported" as green** — re-poll, and only conclude "this repo has no PR checks" after it stays empty, saying so in the report. If red, fix using the same pattern as Step 12 (max 2 cycles) — never merge over a red check; if still red, pause with the blocker note and leave the super-PR open.
4. Merge it — regular merge, delete the remote super base: `gh pr merge "$SUPER_PR_URL" --merge --delete-branch`.
5. Close the super-epic issue with a completion comment linking the merged super-PR (`gh issue comment` + `gh issue close "$SUPER_EPIC_NUMBER"`).
6. Watch post-merge CI on `$SUPER_PARENT` (`/watch-ci` semantics, auto-fix on red — same as Merge Mode step 3).
7. Dead Branch Cleanup of the super base — **guard the delete**: `gh pr merge --delete-branch` (step 4) usually removes the local branch too, and a resumed tail may find it already gone. An unconditional `git branch -d` would then exit non-zero *after* a successful merge, breaking the idempotency this sequence promises. Absent is success, not failure:

   ```bash
   git fetch origin --prune
   git checkout "$SUPER_PARENT" && git pull origin "$SUPER_PARENT"
   if git show-ref --verify --quiet "refs/heads/$SUPER_EPIC_BASE"; then
     # -d, never -D. A refusal here means unmerged commits — investigate, do not force.
     git branch -d "$SUPER_EPIC_BASE" || {
       echo "unmerged commits on $SUPER_EPIC_BASE — the super-PR merge may be incomplete; stop and investigate"; exit 1; }
   fi
   ```
8. Print the all-done report: merged super-PR URL, closed super-epic, and a note that `/deep-review -t` on `$SUPER_PARENT` remains a recommended (optional) quality pass over the full multi-epic diff.

**Pipeline position:** this whole sequence runs inside the Auto-Suggest all-done branch — i.e. AFTER Step 15.5 (auto-fix) and Step 16 (`/cleanup-resources`), not in Merge Mode. Merge Mode's numbered steps (`/pr-complete` on the root PR) are **skipped entirely in Super-Epic child mode** — the "root PR" there is the epic-PR, which the mandatory step already merged. Consequence to respect: any `agent-fix` PR from Step 15.5 targets `$SUPER_EPIC_BASE` and must be merged **before** step 4 above deletes it (see SKILL.md's `-m` fix-PR rule), and the Step 16 manifest must carry the super base as `super-base` / the super-PR as `super-pr` — never as `parent` (cleanup-resources forbids deleting a `parent`).

## How `-m` / `--merge` works in Super-Epic child mode (deferred to chain termination)

The mandatory merge above already handles each session's epic-PR — `-m` never applies to it. Instead `-m` is **forwarded hop to hop along the sibling chain and fires only in the terminal sibling session** (the one whose Auto-Suggest finds no remaining open siblings): that session merges the super-PR into its recorded parent, closes the super-epic issue, watches CI, and cleans up the super base (sequence above). Mid-chain sessions treat `-m` as carry-only — forward it, never act on it.

This replaces the older rule that `-m` was ignored outright. The old concern ("auto-merge might be read as merging the super base into main, which never happens") is resolved by making exactly that the *defined, terminal-only* behavior: opting into `-m` on a super-epic chain IS opting into the final super-PR merge. Without `-m`, nothing changes — the super-PR is left open for `/deep-review -t` + a manual merge.

**`-a` / `--auto` (auto-chain) drives the next-sibling-epic chain** — when `-a` is on the invocation and Auto-Suggest finds a remaining sibling epic, the manager invokes the next epic's command itself (appending `-a`, forwarding `-m` / `-nf` / `-nori` / `-lo`) instead of printing-and-stopping. See the parent SKILL.md "Auto-Suggest Next Command" section.

## Important rules that ONLY apply in Super-Epic child mode

- **Parent branch is fixed to `$SUPER_EPIC_BASE`**, not the invocation branch — this is the one explicit exception to the top-of-skill ROOT PR TARGET BRANCH RULE.
- **The super-PR is created by THIS file, not by the sweep** — after the first epic-PR merges into the super base (merge sub-step 2.5). The sweep pushes a zero-diff super base and stops, so "super base on origin, no super-PR" is a healthy state and **the branch ref, never a PR, is the bootstrap marker**. Every path that needs the PR routes through the one idempotent [Ensure the super-PR exists](#ensure-the-super-pr-exists-idempotent--every-path-routes-through-this) block; `gh pr ready` and `gh pr merge` are never reached with an absent PR.
- **The epic-PR is created in Step 11, not Step 2** — same rule, one level down. A pushed epic base with no epic-PR is what a healthy bootstrap leaves behind; classify from the branch (ahead vs. level with `origin/$SUPER_EPIC_BASE`), never from PR presence. Never fabricate an empty commit to make either PR openable earlier.
- **Each epic-PR MUST be merged before STOP.** Skipping the merge breaks the multi-epic stacking strategy.
- **Always switch to the super-epic base and delete the local epic base after the merge** — instance of the Dead Branch Cleanup Principle.
- **`-m` / `--merge` is deferred to chain termination** (the auto-chain flag `-a` applies every hop) — mid-chain it is carry-only; the terminal sibling merges the super-PR — see above.
- **The super-epic issue is never closed by a mid-chain session** — it stays open until all siblings are merged; the terminal sibling closes it only under `-m` (otherwise the user closes it after `/deep-review -t` + the manual super-PR merge).
