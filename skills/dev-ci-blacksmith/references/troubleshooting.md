# Blacksmith troubleshooting

Context behind the one-liner table in `SKILL.md`. §1–2 and §7–8 apply to any Blacksmith repo; §3 to any container job; §4–6 mostly surface right after a migration from self-hosted runners.

## 1. Job stays "Queued" / "Waiting for a runner to pick up this job"

To GitHub, `blacksmith-*` is an ordinary custom runner label. If nothing registers for it, the job waits instead of erroring, so it reads as "slow CI" rather than "broken CI".

Check in order:

- Blacksmith GitHub App installed for **this owner** and granted **this repo**? (Org install with "selected repositories" silently excludes new repos.)
- Label spelled exactly? `blacksmith-2vcpu-ubuntu-2204`, not `ubuntu-22.04`, not `2cpu`. `actionlint` flags unknown labels unless they are declared in `.github/actionlint.yaml` under `self-hosted-runner.labels` — house repos with an `actionlint.yml` workflow need each new label added there.
- Is the run happening in a fork or a personal mirror of an org repo? The app isn't there. Add `if: github.repository == '<org>/<repo>'` to the job, or use the `vars.*_RUNNER_MODE` fallback expression.
- `https://status.blacksmith.sh`.

Do not enable a `*_RUNNER_MODE=blacksmith` variable before the app access is confirmed; rollback is deleting the variable.

## 2. `Unable to locate executable file: pnpm` in the setup-node step

`actions/setup-node` v5+ turns on package-manager caching by itself when `package.json` declares `packageManager: pnpm@…`, and runs `pnpm store path` to find what to cache. Jobs that intentionally skip `pnpm/action-setup` (dependency-free check scripts that only need `node`) fail right there.

Fix: `package-manager-cache: false` on that job's setup-node. Don't add a pnpm install the job has no use for. In normal jobs, keep `pnpm/action-setup` *before* `actions/setup-node`.

## 3. `fatal: detected dubious ownership in repository at '/__w/<repo>/<repo>'`

Any `run:` step touching git inside a `container:` job: `pnpm install` running a `prepare` script (`lefthook install`, `husky`), `git rev-parse` in a deploy script, build tools reading tags.

There are two HOMEs in a container job. `actions/checkout` (a node action) writes `safe.directory` to the container user's `~/.gitconfig`, typically `/root/.gitconfig`. Shell steps run with `HOME=/github/home` and read a different file, so they never see the entry.

Fix: a step *before* checkout that runs `git config --global --add safe.directory "$GITHUB_WORKSPACE"` — it executes with the shell HOME, which is the one that matters.

| Option | Purpose | Where |
| --- | --- | --- |
| `set-safe-directory: false` on checkout | Keep a persistent `~/.gitconfig` from growing | Self-hosted only — remove on Blacksmith |
| Manual `git config ... safe.directory` step | Make the entry visible to shell-step git | Every container job, any runner |

## 4. `Cache not found for input keys: <name>-<run_id>` in a downstream job

`actions/cache/save` → `cache/restore` keyed on `${{ github.run_id }}` used as a job-to-job pipe. On a single persistent machine it trivially worked. On Blacksmith the backend is shared across VMs so it normally works too, but it has failed when the restoring job runs in a `container:` and under `cancel-in-progress` races; the cache is also branch-scoped, which bites `workflow_run`-triggered consumers running on the default branch.

Fix, in order of preference: make the jobs independent, merge them, or use `upload-artifact` / `download-artifact` (`retention-days: 1`, `if-no-files-found: error`). Artifacts go via the GitHub API and are reachable from any VM or container. The cache stays the right tool for its actual job — speeding up the *next* run.

## 5. `pnpm: command not found` / `ERR_PNPM_NO_PKG_MANIFEST` in a deploy job

The deploy job relied on the previous job having left pnpm on PATH and a workspace on disk. Fresh VM → nothing there. Add `pnpm/action-setup` + `actions/setup-node`; add `actions/checkout` as well when the job runs `pnpm add -w`, or anything else that walks up looking for `package.json` / `pnpm-workspace.yaml`. If the old job had a "Clean workspace" step that deleted `package.json`, delete that step rather than porting it.

## 6. "Self-hosted runner offline" alert on every run

`detect-runner.yml` is still being called. Blacksmith VMs never show up in the self-hosted runner list, so its zero-runners notification path always fires. Remove the job calls and `git rm` the file (migration.md §3). Leave any deploy-result notify job alone.

## 7. PR checks green, deploy on the trigger branch red

PR workflows are usually single-job or independent jobs; deploy workflows are multi-job chains (build → e2e → deploy → notify). §3–5 only exist across jobs, so no amount of pre-merge green covers them. State this in the PR description, then watch the first post-merge run and fix forward (direct commits or small hotfix PRs — ask the user which).

Same shape, different cause: checks whose *command* differs between PR and deploy (e.g. a `--local` dry run on PR vs a `--remote` apply on deploy). Not a runner problem — don't go hunting in Blacksmith for it.

## 8. Flaky or slow only on CI

- Playwright spec timeouts, dev-server startup timeouts → CPU starvation on 2vcpu. Move that job to `blacksmith-4vcpu-ubuntu-2204`, cap Playwright `workers` at 2, shard with a matrix. Confirm with the dashboard's per-job CPU graph or `blacksmith jobs stats <job_id>`.
- `JavaScript heap out of memory` → 2vcpu has 8 GB total. `NODE_OPTIONS: '--max-old-space-size=4096'` for builds; tests that need more belong in a heavy/nightly/local lane.
- Tests needing a GPU, real frame timing, or video encoding do not get better with a bigger label — tag them out of the PR gate.
- Timing differs run to run → free tier bumps happen; compare medians (`blacksmith jobs aggregate`), not single runs.
