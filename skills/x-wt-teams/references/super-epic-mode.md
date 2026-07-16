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
5. **Verify the super-epic base exists on origin** — the `/big-plan` sweep bundle bootstrap creates it (anchor commit + draft super-PR). Defensively check:

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
       echo "Re-run the /big-plan -is sweep bundle bootstrap or create the super-epic anchor manually:"
       echo "  git checkout <parent> && git checkout -b $SUPER_EPIC_BASE && git commit --allow-empty -m '= start super-epic =' && git push -u origin $SUPER_EPIC_BASE"
       exit 1
     fi
   fi
   ```

   **If `$MERGED_SUPER_PR` is non-empty, the batch is already implemented and merged — only the tail
   was lost.** Skip every remaining Step 1a override, Step 2, and the whole implementation pipeline.
   Go straight to the Auto-Suggest **all-done branch ("With `-m`")** and run it from step 0: it is
   idempotent, so step 1 sees the merged super-PR and jumps to the tail (close the super-epic, watch
   CI on `$SUPER_PARENT`, delete the local super base). Do **not** recreate the super base — the
   anchor-recreation advice above is only for the never-bootstrapped case. Capture the target from
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

   1. **Epic issue already CLOSED** → done and signalled. Do not re-implement. Tidy up as branch 2 does: close any still-open `[Sub]` issues of this epic; **always** `git checkout "$SUPER_EPIC_BASE" && git pull origin "$SUPER_EPIC_BASE"` (the chain must continue from the super base, whether or not a stale local epic base exists), and delete that leftover base if present (`git branch -d "$EPIC_BASE" 2>/dev/null || true`). Then go to Auto-Suggest.
   2. **`$MERGED_EPIC_PR` non-empty but the issue is still OPEN** → **the epic is DONE; the crash only lost the post-merge signals.** This is the exact window between merge sub-steps 2 and 4. Do NOT recreate the base, re-run topics, or `gh pr create` (it would die on "No commits between base and head" — the work is already in the super base). Replay only the missing signals — merge sub-steps 3, 4 and 6:

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
      - **No open epic-PR** (the base exists but the PR was never created): create it now, `--base "$SUPER_EPIC_BASE"` — do not skip Step 2's PR creation just because the branch is there.
      - **An open epic-PR exists**: adopt it as the root PR (do NOT `gh pr create` — it fails on a duplicate).

      Then clear the dead session's worktrees — `git worktree prune`, and `git worktree remove` any leftover the prune keeps. A stale worktree holds its topic branch "checked out", which blocks re-creating or re-merging that topic.

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

      **Never respawn a child for a SKIP topic** — its worktree would fork from a base that already contains its own work, producing duplicate or contradictory edits. If every topic is SKIP, the topic phase is done: go to Step 9 (review) → Step 11 (push) → Step 12 (CI) → **Step 13 (mark the epic-PR ready — a draft PR cannot be merged)** → the mandatory merge. (This read-back depends on Step 6 merging topics with `--no-ff`: topic branches are deleted at Step 11, so the named merge commit is the only durable record that a topic landed.)
   4. **Nothing found** (no merged PR, no local or remote epic base, no open epic-PR) → normal Step 2 creation.

7. **Claim THIS epic's issue** (not the super-epic — sibling epics run in parallel in other sessions):

   ```bash
   gh issue comment "$ISSUE_NUMBER" --body "🤖 Starting work on this epic in a Claude Code session (\`/x-wt-teams\` Super-Epic child). To avoid conflicts, please check the latest comments before starting another session on this epic."
   ```

8. **Do NOT close the super-epic issue** at session end — with one exception: the **terminal sibling** (no open siblings remain) that merges the super-PR under `-m` closes it with a completion comment (see "All-done branch" below). Mid-chain, only the merge step's comment links to the merged epic-PR; the super-epic stays open until all sibling epic-PRs are merged. (THIS epic's own issue IS closed — by the mandatory merge step, Step 4. Don't confuse the two.)

## Step 2 override (root PR target)

The root PR is the **epic-PR**. Its `--base` MUST be `$SUPER_EPIC_BASE` (NOT main, NOT the invocation branch). This makes the epic-PR a child of the super-PR.

This is the one explicit exception to the top-of-skill "ROOT PR TARGET BRANCH RULE" — Super-Epic child mode is the exception because the parent is determined by the super-epic markers, not by the invocation branch.

## Mandatory: Merge Epic-PR into Super-Epic Base

**Always runs in Super-Epic child mode, regardless of `-m` / `--merge`.** This step replaces the normal "leave the root PR open for the user to review and merge" behavior — the epic-PR MUST be merged before STOP, no exceptions.

**Why mandatory:** A super-epic stacks many epic-PRs on the same super-epic base. If an epic-PR is left open, the next epic session branches off a stale super-epic base — its topics won't include this epic's work, sibling epic-PRs conflict on shared files, the super-PR never converges. With many epics in flight, the backlog of unmerged epic-PRs becomes unrecoverable.

### Step 1: Re-confirm CI is green on the epic-PR

Step 12 watched CI while the PR was still a **draft** — on a repo whose workflows skip drafts it correctly found no checks and moved on. Step 13's `gh pr ready` may only NOW be triggering the first runs, so **wait** rather than sample:

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

```
## Super-Epic: All epics complete

Super-epic: #<SUPER_EPIC_NUMBER>
All child epics have been merged into <SUPER_EPIC_BASE>.

You are now on <SUPER_EPIC_BASE> (super-epic root branch). The super-PR is ready
for a final quality pass before being merged into <parent branch>.

Run this in a FRESH session to do the final review-and-fix:

    /deep-review -t

That review covers the full super-epic diff, finds quality issues across all the
merged epic work, and applies fixes via a fresh agent team merging back into
<SUPER_EPIC_BASE>. Once the review pass is clean, mark the super-PR ready
(`gh pr ready <super-pr>` — the sweep opened it as a draft) and merge it into
<parent branch>.

⚠️ Merge these FIRST — they target <SUPER_EPIC_BASE>, and merging the super-PR
   deletes that branch, which would auto-close them UNMERGED (their work is lost):
   <list every open PR from `gh pr list --base <SUPER_EPIC_BASE> --state open`,
    or write "none" — chiefly agent-fix PRs from the auto-fix step>

See the super-epic issue for the super-PR URL.
```

`-t` is `/deep-review`'s default but include it explicitly so the user understands team-fix mode is what makes this safe to run on a large multi-epic diff.

**With `-m` — this terminal sibling merges the super-PR (deferred `-m` fires here):**

**This sequence must be idempotent** — a crash inside it is resumed by re-running the same command, and every step below is re-entrant: check the current state first and skip what is already done (the super-PR may already be merged, the super-epic already closed, the base already gone). Never treat "already done" as an error.

0. **Verify nothing still targets the super base.** Step 4 deletes it; any PR still open against it would be auto-closed **unmerged** — silently discarding an `agent-fix` PR from Step 15.5, or a sibling epic-PR the chain thinks it merged:

   ```bash
   OPEN_AGAINST_BASE=$(gh pr list --base "$SUPER_EPIC_BASE" --state open --json number,url --jq 'length')
   [ "$OPEN_AGAINST_BASE" -eq 0 ] || {
     echo "PRs still open against $SUPER_EPIC_BASE — merge or close them before the super-PR merge:"
     gh pr list --base "$SUPER_EPIC_BASE" --state open --json number,url --jq '.[].url'
     exit 1; }
   ```

   This is the enforcement behind the ordering rule (fix PRs merge at Step 15.5, before Step 16 and this branch). Ordering alone is not a guarantee — a fix PR whose CI never went green is still open here, and would otherwise be destroyed by the merge.

1. Locate the super-PR — **prefer the URL recorded in the super-epic issue body** (it names *this* bundle's PR unambiguously); fall back to `gh pr list --head "$SUPER_EPIC_BASE" --state open`. Capture its target: `SUPER_PARENT=$(gh pr view <super-pr> --json baseRefName -q .baseRefName)`. **If THAT PR's own state is already MERGED** (`gh pr view <super-pr> --json state -q .state`), a previous attempt got this far — skip to step 5 (close the super-epic) and finish the tail.

   **Never conclude "already merged" from a bare `--head` list.** PR records outlive `--delete-branch`, so a later sweep that recycled this base name would match the *previous* bundle's merged super-PR — and this session would close its super-epic without ever merging its own super-PR, stranding a whole batch of merged epic work behind a still-draft PR. Always resolve to a specific PR, then read that PR's state. (The sweep's slug-collision loop also probes PR history to stop the recycling in the first place; this is the second line of defense.)
2. **Take the super-PR out of draft — do this FIRST.** `/big-plan`'s sweep bootstrap opens it with `--draft` (deliberately: a draft can't be merged while sibling epic-PRs are still stacking onto the super base). GitHub refuses to merge a draft PR, so without this the whole autonomous batch dies at its final step:

   ```bash
   gh pr ready <super-pr>
   ```

   (Optionally run `/pr-revise` on it first so its body describes the full multi-epic diff.)
3. Re-check CI on the super-PR. The ready-flip may only now be triggering the first runs (many workflows skip drafts), so **wait** rather than sample: `gh pr checks <super-pr> --watch`. **Do not read "no checks reported" as green** — re-poll, and only conclude "this repo has no PR checks" after it stays empty, saying so in the report. If red, fix using the same pattern as Step 12 (max 2 cycles) — never merge over a red check; if still red, pause with the blocker note and leave the super-PR open.
4. Merge it — regular merge, delete the remote super base: `gh pr merge <super-pr> --merge --delete-branch`.
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
- **Each epic-PR MUST be merged before STOP.** Skipping the merge breaks the multi-epic stacking strategy.
- **Always switch to the super-epic base and delete the local epic base after the merge** — instance of the Dead Branch Cleanup Principle.
- **`-m` / `--merge` is deferred to chain termination** (the auto-chain flag `-a` applies every hop) — mid-chain it is carry-only; the terminal sibling merges the super-PR — see above.
- **The super-epic issue is never closed by a mid-chain session** — it stays open until all siblings are merged; the terminal sibling closes it only under `-m` (otherwise the user closes it after `/deep-review -t` + the manual super-PR merge).
