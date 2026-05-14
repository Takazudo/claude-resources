---
name: dev-wip-package-upstream-wt-dev
description: "Workflow for editing a WIP upstream package (consumed by this project via a sibling `file:../upstream/...` dep) when a fix or feature requires changing the upstream's code. ALWAYS work in a git worktree of the upstream — never on the shared `../upstream/` root checkout — because every consumer using that sibling shares the same on-disk HEAD. Use when: (1) The fix lives in the upstream package's source, not the consumer's, (2) User says 'edit upstream', 'fix upstream', 'patch upstream', 'upstream PR', 'I need to change the upstream framework', 'fix zfb / zdtp upstream', (3) Triaging a consumer-side issue and the root cause is in the upstream library, (4) Bumping the consumer's pin requires landing an upstream PR first."
---

# dev-wip-package-upstream-wt-dev

The workflow for editing a WIP upstream package (one consumed via the sibling `file:../upstream/...` pattern) and pulling the fix back into the consumer.

For the consumer-side consumption pattern, see [`dev-wip-package-refer`](../dev-wip-package-refer/SKILL.md).

## Why the worktree rule

The upstream sibling at `../upstream/` is **shared** with every consumer using the `file:` dep — including any concurrent Claude Code session on the same machine. Running `git checkout`, `git reset`, or `git pull` on `../upstream/` swaps the dep state mid-build for every consumer, silently. Two sessions doing this at once produces a race that's hard to spot afterwards.

The fix: **never touch the upstream root**. Create a git worktree of the upstream on a fresh branch. The worktree gives you a private branch on disk; the root's HEAD doesn't move. Other consumers keep seeing the SHA they expect.

This rule was paid for in a real incident: two sessions concurrently checked out different branches at the shared upstream root and the second `git checkout` overwrote the first's build state.

## The workflow

```
1. File issue on upstream
2. Worktree from upstream main → edit, build, test
3. Push branch + open PR to upstream main
4. Watch upstream CI, merge
5. Watch upstream main's post-merge CI
6. Come back to consumer → bump pin to new merged SHA
7. Watch consumer CI on the bump PR
```

### Step 1 — File the issue on the upstream repo

Open the issue on the upstream's repo, not the consumer's. The fix lives upstream; the bug-tracking should too. Use the `gh` CLI with `-R`:

```bash
gh issue create -R <upstream-org>/<upstream-repo> \
  --title "<concise problem statement>" \
  --body "<context, repro, recommended fix>"
```

Real examples: `Takazudo/zudo-front-builder#271`, `Takazudo/zudo-front-builder#272` — both filed from a zudo-doc session when consumer-side audits surfaced upstream-shaped fixes.

If a related consumer-side issue exists, link it from the upstream issue body (and vice-versa) so both trails are findable.

### Step 2 — Worktree from upstream `main`, do the work

The convention: a worktree under `../upstream/worktrees/<topic>/` so all of an upstream repo's worktrees live in one place. Branch from `origin/main`.

```bash
# Choose a short topic name (kebab-case)
TOPIC=fix-island-unmount

# Fetch upstream's latest main (read-only, safe at the root)
git -C ../upstream fetch origin main

# Create the worktree — branch is created off origin/main
git -C ../upstream worktree add worktrees/$TOPIC -b fix/$TOPIC origin/main

# Switch into the worktree and work there
cd ../upstream/worktrees/$TOPIC
# ... edit files, run build/tests scoped to upstream ...
```

While inside the worktree, you can `git commit`, run the upstream's build (`cargo build`, `pnpm build`, etc.), run upstream tests, and use the upstream's own dev tooling. The shared `../upstream/` root is untouched — other consumers still see whatever HEAD it had before.

**Don't bump the consumer's pin yet.** The pin still points at the previous merged SHA. The consumer's `pnpm install` keeps using the package built at the old SHA. You're just preparing an upstream PR.

### Step 3 — Push the branch and open a PR to upstream `main`

```bash
# From inside the worktree
git push -u origin fix/$TOPIC

gh pr create -R <upstream-org>/<upstream-repo> \
  --base main \
  --title "<conventional-commit style title>" \
  --body "$(cat <<'EOF'
## Summary
- <what the PR does>

## Test plan
- [ ] <upstream-side tests / lints>
- [ ] <build artifact still produced cleanly>

Closes #<upstream-issue-number>
EOF
)"
```

Address review iteratively in the worktree. Upstream CI runs against the PR.

### Step 4 — Merge the upstream PR

Merge (regular merge by default per project policy — squash only if upstream prefers). Upstream `main` now has the fix.

### Step 5 — Watch post-merge upstream CI

`origin/main` runs its own CI on every push. Wait for that run to go green before bumping the consumer's pin — the consumer's CI will clone that exact SHA, so a red post-merge `main` will fail the consumer side too.

```bash
gh run watch -R <upstream-org>/<upstream-repo> --exit-status
```

Or use `/watch-ci` on the upstream main branch.

### Step 6 — Bump the consumer's pin

This is when the consumer adopts the upstream fix. From the consumer repo:

```bash
# Read the new merged SHA from the upstream's main
TARGET_SHA=$(git -C ../upstream rev-parse origin/main)
echo "$TARGET_SHA"

# Edit .github/workflows/*.yml — update the relevant *_PINNED_SHA env var to $TARGET_SHA.
# (If the consumer pins via a framework-pins.json — see dev-wip-package-refer — edit that
# single file instead.)

# Commit + push the bump on a consumer-side branch and open a PR.
git checkout -b chore/bump-upstream-pin
# ... edit + commit + push + gh pr create ...
```

The consumer's CI clones the upstream at the new SHA into a clean `../upstream/`, runs the full build, and reports green/red on the bump PR.

### Step 7 — Watch the consumer's bump-PR CI

If green, merge the bump PR. If red, the upstream change broke something consumer-side — file a consumer follow-up issue and decide whether to revert the bump, patch the consumer to adapt, or revert the upstream change.

## Cleaning up

After the upstream PR merges and the consumer pin bump lands:

```bash
# Remove the upstream worktree (from anywhere in the upstream repo)
git -C ../upstream worktree remove worktrees/$TOPIC

# If the upstream branch wasn't deleted by the merge UI, delete it locally
git -C ../upstream branch -D fix/$TOPIC 2>/dev/null || true
```

Worktrees that linger fill the upstream repo's `worktrees/` directory and confuse future `git worktree list` output.

## Read-only inspection at the upstream root is fine

You don't need a worktree just to **look** at upstream code. `Read`, `grep`, and `cat` at `../upstream/` are safe. Even `git fetch` is non-mutating to working state and safe at the root:

```bash
git -C ../upstream fetch origin                              # safe
git -C ../upstream log --oneline origin/main -n 30           # safe
git -C ../upstream show origin/main:path/to/file             # safe
```

What's NOT safe at the root: `checkout`, `reset`, `pull`, `merge`, `rebase`, `clean`, anything that moves HEAD or mutates the working tree.

## Don't push from a worktree of the consumer

Some consumers (e.g. zudo-doc via `dev-scaffold-wt-dev`) install a `pre-push` git hook that blocks pushes from worktrees under `worktrees/`. That hook is **the consumer's** policy and applies to the consumer's own worktrees only. It does NOT apply to upstream worktrees you create under `../upstream/worktrees/` — those are a different repo entirely. Push from the upstream worktree normally.

## When to short-circuit the loop

The full 7-step loop is for fixes that need upstream-side review/CI before the consumer can use them. Cases where it's appropriate to short-circuit:

- **Tiny upstream fix you'd merge yourself anyway** — still file the issue (paper trail) and open the PR (CI runs upstream-side), but iterate fast.
- **Consumer-side workaround is acceptable** — sometimes the right answer is to add a workaround in the consumer and file the upstream issue for "fix this properly later, then we can drop the workaround." Don't block on upstream when a clean consumer-side fix is available.
- **Speculative upstream change** — if you're not sure the fix is right, prototype in the worktree and consume it via a temporary `file:` redirect in the consumer's `package.json` pointing at the worktree path. Validate end-to-end, THEN open the upstream PR. Restore the consumer's normal `file:` path before committing on the consumer side.

## Anti-patterns

- **Running `git checkout <branch>` at `../upstream/`** — moves the shared HEAD for every consumer. Use a worktree.
- **Editing upstream from the consumer's worktree** — confused layering, your changes are committed on the wrong branch in the wrong repo. Always `cd` into the upstream's worktree first.
- **Bumping the pin to an unmerged upstream branch** — works on your machine because `../upstream/` happens to be on that branch, but breaks on every other machine and in CI. Always bump to a merged commit on upstream `main`.
- **Forgetting Step 5 (post-merge upstream CI)** — bumping the pin to a SHA whose post-merge `main` CI is failing means the consumer will also fail. Wait for green.
- **Leaving stale worktrees around** — clean up after the PR merges.

## Project-specific overlays

Some projects have a project-scope skill that pre-fills the org/repo names and any extra rules. If one exists, consult it alongside this generic skill:

- `l-zfb-upstream-dev` (in zudo-doc / zudo-doc2) — same workflow with zfb-specific upstream URL, branch names, and build steps already wired in.
