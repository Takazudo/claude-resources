---
name: dev-blacksmith-migration
description: "Migrate a repo's GitHub Actions CI from the self-hosted-with-fallback pattern (detect-runner reusable workflow + jobs that consume `${{ needs.detect-runner.outputs.runner }}`) to direct Blacksmith cloud runner labels. Use when: (1) User says 'blacksmith migration', 'migrate to blacksmith', 'switch to blacksmith', 'dev-blacksmith-migration', 'drop detect-runner', (2) Repo has `.github/workflows/detect-runner.yml` or any job using `runs-on: ${{ needs.<something>.outputs.runner }}`, (3) User wants to retire a self-hosted runner and rely fully on Blacksmith or another ephemeral cloud runner. Walks the gotchas — cross-instance cache miss, missing pnpm/Node setup in deploy-only jobs, container-job dubious-ownership, leftover `set-safe-directory: false` / Clean workspace / Fix workspace permissions steps."
---

# Blacksmith Migration

Migrate a repo from the "detect-runner with self-hosted fallback" CI pattern — the pattern `/dev-actions-self-runner` installs — to direct [Blacksmith](https://blacksmith.sh/) cloud runner labels. The same playbook applies to other ephemeral cloud runner services (RunsOn, BuildJet, Namespace, Depot) — the runner-label syntax differs, the gotchas don't.

## When this skill triggers

The repo has at least one of:

- `.github/workflows/detect-runner.yml` (or similarly named) reusable workflow that polls the GitHub API for online self-hosted runners and emits a `runner` output
- Consumer jobs with `runs-on: ${{ needs.detect-runner.outputs.runner }}`
- Any `runs-on:` mixing `self-hosted` and `ubuntu-latest` via expressions
- `set-safe-directory: false` on `actions/checkout` (a self-hosted-only optimization)

If you don't see any of those, this skill is the wrong tool — the user just needs a normal `runs-on` label switch.

## Step 1: Audit the current state

Run the audit script to find every self-hosted-ism in `.github/workflows/`:

```bash
bash $HOME/.claude/skills/dev-blacksmith-migration/scripts/audit.sh
```

It prints, for each workflow file:

- `runs-on:` values (which need replacement)
- `detect-runner` references (job calls + `needs:` lists)
- `set-safe-directory: false` occurrences
- Manual `safe.directory` / `chown` / "Clean workspace" steps
- Jobs that use `container:` (these need extra care — see Step 6)
- Inter-job data sharing patterns (`actions/cache/save` → `actions/cache/restore` across jobs, or `actions/upload-artifact` → `download-artifact`)

Read the output before making any edits.

## Step 2: Ask the user the 2 decisions

Don't guess; ask. The answers determine which steps below to apply.

1. **Drop `detect-runner` entirely, or keep it as a fallback?**
- Default recommendation: drop it. Blacksmith replaces self-hosted; the polling job always sees zero online runners (Blacksmith instances are ephemeral and don't register in the org's self-hosted runners list), fires false alarms (e.g., IFTTT), and emits an `ubuntu-latest` output that consumers ignore once they hardcode the Blacksmith label.
- Keep only when there's a real mixed fleet: dedicated self-hosted runners that *do* register persistently, with Blacksmith as backup.

2. **What Blacksmith runner spec?**
- Default suggestion: `blacksmith-2vcpu-ubuntu-2204` (matches `ubuntu-latest`'s 2-vCPU shape). Bigger jobs may want `blacksmith-4vcpu-ubuntu-2204`, `blacksmith-8vcpu-ubuntu-2204`, etc. — confirm with the user.
- Ubuntu version: `ubuntu-2204` is the safe default. Use `ubuntu-2404` only if the workflow explicitly needs Ubuntu 24.04 features.
- ARM variant: append `-arm` (e.g. `blacksmith-2vcpu-ubuntu-2204-arm`) when targeting arm64 builds.

## Step 3: Replace `runs-on:` values

Every `runs-on:` value in `.github/workflows/` becomes (using the spec from Step 2):

```yaml
runs-on: blacksmith-2vcpu-ubuntu-2204
```

This includes:

- `runs-on: ${{ needs.detect-runner.outputs.runner }}` — replace
- `runs-on: ubuntu-latest` — replace (including the `detect` job inside `detect-runner.yml` itself if you're keeping the file)
- `runs-on: self-hosted` — replace
- `runs-on: runs-on=${{ github.run_id }}/runner=2cpu-linux-x64` (or any RunsOn label) — replace, if the repo went RunsOn → Blacksmith
- Any matrix or expression form that resolves to a GitHub-hosted, self-hosted, or other-provider label

Use `replace_all: true` on the Edit tool if all `runs-on:` values become identical.

## Step 4: Drop the `detect-runner` plumbing (if Step 2 #1 was "drop")

In each consumer workflow:

- Delete the `detect-runner:` job that calls `uses: ./.github/workflows/detect-runner.yml`
- Remove its surrounding comment block
- For every other job, drop `detect-runner` from the `needs:` list:
  - `needs: detect-runner` → remove the line entirely (job has no other deps)
  - `needs: [detect-runner, build]` → `needs: build`
  - `needs: [detect-runner, build, test]` → `needs: [build, test]`

Then `git rm .github/workflows/detect-runner.yml`.

The repo's `RUNNER_CHECK_TOKEN` GitHub Actions secret becomes orphan — tell the user it can be deleted manually if desired (you can't delete secrets via gh CLI without scope they may not want to grant).

If `detect-runner.yml` was emitting an IFTTT "self-hosted offline" notification, that goes away with the file. The deploy-status IFTTT notification (a separate job in the consumer workflow) is a *different concern* — leave that alone.

## Step 5: Fix self-hosted leftovers in remaining jobs

For every `actions/checkout` step:

```yaml
# Self-hosted leftover — REMOVE the with: block (or just the one option)
- uses: actions/checkout@<sha>
  with:
    set-safe-directory: false  # ← DELETE this option
```

Default `set-safe-directory: true` is required for container jobs to access the workspace. Leaving it `false` causes mysterious `fatal: detected dubious ownership` errors in container subprocesses.

Delete these step types if you find them — they're all "next-run cleanup" patterns that ephemeral runners don't need:

- `Clean workspace` (`rm -rf $GITHUB_WORKSPACE/...` before the rest of the job)
- `Fix workspace permissions` (`chown -R ... $GITHUB_WORKSPACE` at job end)
- Any step that "resets" or "prepares" the workspace before checkout

## Step 6: Container jobs need a manual safe.directory step (regardless of runner)

For any job that uses `container:` (not `runs-on:`), add this step *before* checkout:

```yaml
test:
  runs-on: blacksmith-2vcpu-ubuntu-2204
  container:
    image: mcr.microsoft.com/playwright:v1.58.2-noble
  steps:
    - name: Mark workspace as safe for git
      run: git config --global --add safe.directory "$GITHUB_WORKSPACE"

    - uses: actions/checkout@<sha>
    # ... rest of the steps
```

**Why:** `actions/checkout` (a node action) writes safe.directory to `/root/.gitconfig` inside the container, but shell `run:` steps inside the same container have `HOME=/github/home` and read `/github/home/.gitconfig`. Without this step, lifecycle scripts like `pnpm install`'s `prepare` (which runs `lefthook install`, `husky install`, etc.) hit `fatal: detected dubious ownership in repository at '/__w/<repo>/<repo>'`.

This is **not** self-hosted-specific — it's a container-on-any-runner concern. The original codebase probably had this step alongside `set-safe-directory: false`, and the pair *looked* self-hosted-only. Keep this step; drop the `set-safe-directory: false`.

## Step 7: Inter-job data sharing — prefer artifacts on ephemeral runners

If the workflow has multiple jobs and shares files between them (typical Build → Test → Deploy split), audit the existing pattern:

- **`actions/cache/save` → `actions/cache/restore`** keyed by `${{ github.run_id }}`: works on a single self-hosted runner. Blacksmith provides an accelerated cache backend that survives across instances, but `actions/cache` was never designed as a job-to-job pipe — it's a "speed up next run" mechanism. Misusing it as inter-job transport is fragile (cache eviction, key collisions, container-network edge cases).
- **`actions/upload-artifact@v4` → `actions/download-artifact@v4`**: route through `api.github.com`, work cross-instance, work in containers, the documented inter-job transport.

**Recommended for any Blacksmith migration with multi-job workflows: switch to artifacts**.

Concrete swap (in the upstream job):

```yaml
# BEFORE
- name: Cache blog build output
  uses: actions/cache/save@<sha>
  with:
    path: blog/dist/
    key: blog-build-${{ github.run_id }}

# AFTER
- name: Upload blog build output
  uses: actions/upload-artifact@v4
  with:
    name: blog-dist
    path: blog/dist/
    retention-days: 1
    if-no-files-found: error
```

In the downstream jobs:

```yaml
# BEFORE
- name: Restore blog build cache
  uses: actions/cache/restore@<sha>
  with:
    path: blog/dist/
    key: blog-build-${{ github.run_id }}

# AFTER
- name: Download blog build output
  uses: actions/download-artifact@v4
  with:
    name: blog-dist
    path: blog/dist/
```

Blacksmith's accelerated `actions/cache` backend is fine to keep using for its intended purpose — speeding up `setup-node`, the pnpm store, and build-tool caches across runs. Just don't use it as an inter-job pipe within a single run.

## Step 8: Audit deploy-only jobs

Any job that does NOT have its own `actions/checkout` but DOES run commands like `pnpm`, `npm`, or `node` is a self-hosted leftover. On the persistent runner, the workspace and toolchain were inherited from a previous job; on ephemeral runners, each job starts on a fresh VM.

Symptom: `pnpm: command not found` in the deploy job after Build and Test pass.

Fix: add the missing setup steps at the top of the job:

```yaml
deploy:
  steps:
    - name: Checkout repository      # if the job needs package.json / pnpm-workspace.yaml
      uses: actions/checkout@<sha>

    - name: Setup pnpm
      uses: pnpm/action-setup@<sha>

    - name: Setup Node.js
      uses: actions/setup-node@<sha>
      with:
        node-version: <match the other jobs>

    # ... existing artifact downloads, deploy commands, etc.
```

If the deploy job runs `pnpm add -w <pkg>` or any command that needs a pnpm workspace, the `actions/checkout` is required (otherwise there's no `package.json` / `pnpm-workspace.yaml` for pnpm to find). Otherwise just the two setup steps may be enough.

## Step 9: Validate — beware the partial-validation trap

PR-level CI (often `pr-checks.yml`) usually runs a *single-job* preview-deploy workflow. **It cannot exercise the cross-job artifact passing or the container-job paths** that the production deploy uses. Pre-merge green on pr-checks is necessary but not sufficient.

The full validation requires merging to the trigger branch (usually `main`) and watching the production deploy. Plan for one or more iteration cycles directly on `main` if the user is OK with that, or coordinate via short-lived hotfix PRs.

For each push, watch CI with `/watch-ci <pr>` (PR mode) or `/watch-ci` (auto-detects the merged-PR path on the target branch).

## Common failure modes (one-liner fixes)

When a deploy fails post-merge, check the failing job's step name and match against the table below before re-reading logs in detail:

| Failing step output | Cause | Fix |
| --- | --- | --- |
| `Cache not found for input keys: ...-<run_id>` | `actions/cache` used as inter-job transport on ephemeral runners | Switch to artifacts (Step 7) |
| `pnpm: command not found` in deploy job | Deploy-only job missing setup steps | Add Setup pnpm + Setup Node.js (Step 8) |
| `fatal: detected dubious ownership in repository at '/__w/...'` | Container-job HOME mismatch between checkout and shell git | Add manual `safe.directory` step before checkout (Step 6) |
| `pnpm add -w <pkg>` errors with no `pnpm-workspace.yaml` found | Deploy job has no checkout | Add `actions/checkout` to the job (Step 8) |
| Build job's IFTTT alert "self-hosted runner offline" still firing | Old `detect-runner.yml` still in repo | `git rm` the workflow file (Step 4) |

For deeper context on each, see [references/troubleshooting.md](references/troubleshooting.md).

## Skill scope reminder

This skill is for the **migration**. Day-to-day GitHub Actions best practices (timeouts, concurrency, action pinning, security) live in `/gh-actions-wisdom`. Read both when starting a migration so you don't accidentally regress on those general rules while shuffling runner labels.
