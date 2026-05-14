# Blacksmith migration troubleshooting

Detailed context for the failure modes summarized in `SKILL.md`. Read this when a migration hits a symptom that doesn't have an obvious one-liner fix in the main file.

## 1. `Cache not found for input keys: <name>-<run_id>`

**Where it shows up:** the downstream job's `actions/cache/restore` step. Every job in the workflow uses `${{ github.run_id }}` as the cache key suffix, so the key matches by construction — yet the lookup fails.

**Why:** Blacksmith allocates a fresh ephemeral instance per job. While Blacksmith's accelerated cache backend does survive across instances, `actions/cache` was never designed as a job-to-job pipe within a single run — it's a "speed up next run" mechanism. Misusing it as inter-job transport hits edge cases: container-network reachability, key collisions when concurrency cancels mid-flight, and silent eviction during long workflows.

**Fix:** switch the inter-job passing from `actions/cache` to `actions/upload-artifact` + `actions/download-artifact`. Artifacts go through `api.github.com` which is reachable from any instance and any container, and they are the documented inter-job transport. (See SKILL.md Step 7 for the concrete diff.)

Keep using Blacksmith's accelerated `actions/cache` for what it's good at — speeding up `setup-node`, the pnpm store, and build-tool caches across runs. Just don't lean on it as a single-run pipe.

## 2. `pnpm: command not found` (or `npm`/`node` not found) in a deploy job

**Where it shows up:** typically in a "deploy" job that downloads artifacts and shells out to a package manager — for example `pnpm dlx wrangler@4 pages deploy` or `pnpm add -w <pkg>`.

**Why:** the deploy job inherited a pattern that worked on a self-hosted runner where the previous job's `setup-pnpm` left the binary on PATH (or the runner image preinstalled it). On ephemeral runners, every job starts on a fresh VM with only what its own steps install.

**Fix:** add the missing setup steps at the top of the job. If the job invokes `pnpm add -w` (workspace add), it also needs `actions/checkout` so pnpm can find `package.json` and `pnpm-workspace.yaml`. (See SKILL.md Step 8.)

**Subtle gotcha:** the original pattern on self-hosted may have included a "Clean workspace" step that `rm -rf`'d `package.json` and `pnpm-lock.yaml`. The fix is *not* to keep that step — it was there because the workspace persisted on self-hosted and might have stale state. On ephemeral runners, drop the cleanup and add a real `actions/checkout`.

## 3. `fatal: detected dubious ownership in repository at '/__w/<repo>/<repo>'`

**Where it shows up:** any shell `run:` step inside a `container:` job that touches git. Common triggers:

- `pnpm install` running its `prepare` lifecycle (which calls `lefthook install`, `husky install`, etc.)
- A `git rev-parse` or `git status` invocation in a deploy script
- Build tools that read git tags for versioning

**Why:** there are *two* HOMEs inside a container job:

- The node-action HOME (where `actions/checkout` runs git config). Often `/root` on container images that run as root.
- The shell-step HOME for `run:` blocks. Set by GitHub Actions to `/github/home` via `docker create -e HOME=/github/home`.

`actions/checkout` with default `set-safe-directory: true` runs `git config --global --add safe.directory <workspace>`. The `--global` flag writes to `$HOME/.gitconfig` — which here means `/root/.gitconfig`. Subsequent shell steps read `/github/home/.gitconfig` (different file) and don't see the entry, so git falls back to the dubious-ownership guard.

**Fix:** add an explicit step *before* `actions/checkout` that runs `git config --global --add safe.directory "$GITHUB_WORKSPACE"`. That step runs in the shell-step HOME, so it writes to `/github/home/.gitconfig` and every subsequent shell-step git invocation sees it. (See SKILL.md Step 6.)

This is **not self-hosted-specific** — the migration playbook gets this wrong if you also remove the manual safe.directory step alongside `set-safe-directory: false`. The two options *look* like a pair but solve different problems:

| Option | What it does | When to use |
| --- | --- | --- |
| `set-safe-directory: false` on checkout | Don't pollute persistent gitconfig | Self-hosted only — remove for ephemeral |
| Manual `git config --global --add safe.directory ...` step | Make safe.directory visible to shell-step git | Any container job, any runner |

## 4. `pnpm add -w <pkg>: ERR_PNPM_NO_PKG_MANIFEST` (or similar "no workspace found")

**Where it shows up:** the deploy job's "install function dependencies" or equivalent step.

**Why:** the deploy job has `setup-pnpm` and `setup-node` (so pnpm is on PATH) but no `actions/checkout`. `pnpm add -w` walks up from CWD looking for `pnpm-workspace.yaml` (or a `workspaces:` field in `package.json`); on a fresh ephemeral runner the workspace is empty.

**Fix:** add `actions/checkout` to the deploy job. The whole repo isn't strictly needed — `actions/checkout` with `sparse-checkout: '. !blog !doc'` or similar can shave time — but plain checkout works and keeps the diff small.

## 5. False-alarm "self-hosted runner offline" notification still firing

**Where it shows up:** every workflow run after the migration triggers an IFTTT/Slack/email notification claiming the self-hosted runner is offline.

**Why:** the consumer workflows still call `detect-runner.yml`, which still polls the org's self-hosted runners. Since you've intentionally drained that pool, the count is always 0, and detect-runner's "fallback notification" path always fires.

**Fix:** drop the detect-runner job calls (`uses: ./.github/workflows/detect-runner.yml`) and `git rm` the workflow file itself. The notification step lives inside detect-runner.yml; once the file is gone the notification cannot fire. (See SKILL.md Step 4.)

If the notification is *also* used for deploy success/failure (a separate job in `main-deploy.yml` or similar), keep that one — it's a different concern from the runner-fallback alert.

## 6. PR-checks pass but production deploy fails

**Where it shows up:** the migration PR's `pr-checks.yml` workflow goes green; the merge happens; the immediate `main-deploy.yml` run on `main` fails with one of the issues above.

**Why:** `pr-checks.yml` is typically a *single-job* workflow (build + preview deploy in one job), while `main-deploy.yml` is multi-job (Build → E2E → Deploy → Notify). The single-job design hides every cross-job problem (cache miss, artifact upload, missing pnpm/node setup, container HOME mismatch).

**Fix:** there is no pre-merge fix — pr-checks fundamentally cannot exercise the cross-job paths. Plan for one or more iteration cycles directly on `main` after merge:

- If acceptable to the user: commit-push hotfixes directly to `main` and watch each deploy with `/watch-ci`.
- If a cleaner audit trail is required: open small hotfix PRs targeting `main`, merge, watch.

This is also why the migration-PR description should be honest: pre-merge green is necessary but not sufficient; the validation gate is post-merge.
