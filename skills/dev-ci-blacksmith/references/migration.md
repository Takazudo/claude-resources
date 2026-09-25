# Migrating to Blacksmith from self-hosted / `detect-runner`

For repos on the "detect-runner with self-hosted fallback" pattern: a reusable `.github/workflows/detect-runner.yml` polls the GitHub API for online self-hosted runners, emits a `runner` output, and consumers use `runs-on: ${{ needs.detect-runner.outputs.runner }}`. zmod is the remaining house example. The same leftovers apply when coming from RunsOn or any persistent runner.

Coming from plain GitHub-hosted runners? Skip this file — swap the labels and install the app.

## 0. Audit first

```bash
bash $HOME/.claude/skills/dev-ci-blacksmith/scripts/audit.sh [repo-root]
```

Read-only. Lists every `runs-on:`, detect-runner reference, `set-safe-directory: false`, workspace-cleanup step, `container:` job, inter-job transport, archived `useblacksmith/*` fork, and job without its own checkout.

## 1. Two decisions to ask the user

1. **Drop `detect-runner` or keep it?** Default: drop. Blacksmith VMs never appear in the org's self-hosted runner list, so the poll always sees zero runners, fires its "runner offline" alert on every run, and emits an output nobody reads. Keep only for a real mixed fleet with persistent self-hosted runners.
2. **Which label?** Default `blacksmith-2vcpu-ubuntu-2204`; see SKILL.md for when 4vcpu is justified.

## 2. Replace every `runs-on:`

Including `ubuntu-latest` jobs, `self-hosted`, RunsOn labels (`runs-on=${{ github.run_id }}/runner=...`), and the `detect` job inside `detect-runner.yml` if the file is staying.

## 3. Remove the detect-runner plumbing

- Delete each `detect-runner:` job (`uses: ./.github/workflows/detect-runner.yml`) and its comment block.
- Strip it from every `needs:` — `needs: detect-runner` → delete the line; `needs: [detect-runner, build]` → `needs: build`.
- `git rm .github/workflows/detect-runner.yml`.
- Tell the user the `RUNNER_CHECK_TOKEN` secret is now unused (they delete it; don't touch secrets yourself).
- The "self-hosted offline" IFTTT alert lives inside that file and dies with it. A deploy-result notify job in the consumer workflow is a separate concern — keep it.

## 4. Delete self-hosted leftovers

- `set-safe-directory: false` on `actions/checkout` → remove the option. It existed to stop `~/.gitconfig` growing on a persistent machine; on ephemeral runners it breaks container jobs.
- "Clean workspace" (`rm -rf $GITHUB_WORKSPACE/...`), "Fix workspace permissions" (`chown -R ...`), "Clean pnpm setup cache" (`rm -rf ~/setup-pnpm*`) steps → delete.
- Per-workflow `pnpm/action-setup` `dest: ~/setup-pnpm-<workflow>` → drop the `with:`. Inherited from the self-hosted era, where jobs sharing one machine (and one `$HOME`) would otherwise collide on the pnpm install dir. (zzmod still carries both of these from its import; harmless, but don't copy them into new workflows.)
- Any `extras=` / cache-proxy options on old RunsOn labels go away with the label.

## 5. Container jobs: add the manual safe.directory step

Keep or add this *before* checkout in any job with `container:` — on any runner type:

```yaml
- name: Mark workspace as safe for git
  run: git config --global --add safe.directory "$GITHUB_WORKSPACE"
- uses: actions/checkout@<sha>
```

It looks like a pair with `set-safe-directory: false` and gets deleted along with it by mistake. They solve different problems — see troubleshooting §3.

## 6. Inter-job data

`actions/cache/save` → `cache/restore` keyed on `${{ github.run_id }}` worked on a single persistent machine. On Blacksmith it usually still works (the cache backend is shared across VMs) but failed from container jobs during past migrations. In order of preference: make jobs independent, merge build+deploy into one job, or switch to `upload-artifact` / `download-artifact` with `retention-days: 1` and `if-no-files-found: error`.

## 7. Deploy-only jobs need their own toolchain

A job with no `actions/checkout` that runs `pnpm` / `node` was inheriting state from the previous job on the same machine. On a fresh VM it fails with `pnpm: command not found`. Add pnpm + node setup; add checkout too if the job runs anything that needs `package.json` / `pnpm-workspace.yaml` (`pnpm add -w`, `pnpm dlx` with workspace config).

## 8. Validate

`actionlint` locally, then push. PR checks are typically single-job and cannot exercise steps 5–7; the first post-merge run of the multi-job deploy workflow is the real test. Agree with the user up front whether follow-up fixes go straight to the trigger branch or through small hotfix PRs, and `/watch-ci` each run.
