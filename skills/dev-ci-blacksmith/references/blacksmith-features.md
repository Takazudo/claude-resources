# Blacksmith features beyond the `runs-on` label

Snapshot of `docs.blacksmith.sh` as of 2026-09. None of the optional actions here are used in a house repo yet, so **re-check the doc page (append `.md` to any docs URL) for current versions before adding one**, and SHA-pin it like every other action.

## Runner labels

Pattern: `blacksmith-<N>vcpu-<os>[-arm]`.

| Family | Sizes | Labels | 2vcpu spec |
| --- | --- | --- | --- |
| Ubuntu x64 | 2 / 4 / 8 / 16 / 32 | `blacksmith-Nvcpu-ubuntu-2204`, `-ubuntu-2404` | 8 GB RAM, 80 GB disk |
| Ubuntu ARM | 2 / 4 / 8 / 16 / 32 | same + `-arm` suffix | 6 GB RAM, 75 GB disk |
| Windows x64 (beta) | 2 / 4 / 8 / 16 / 32 | `blacksmith-Nvcpu-windows-2025` | 7 GB RAM — no full Visual Studio, Build Tools only |
| macOS (Apple Silicon M4) | 6 / 12 | `blacksmith-Nvcpu-macos-15`, `-macos-26`, `-macos-latest` | 6vcpu: 24 GB RAM |

- RAM scales 4 GB per vCPU on x64 (3 GB on ARM). Images match GitHub's official runner images, so preinstalled tools are the same.
- No Intel macOS. No `ubuntu-latest`-style floating Ubuntu label — pick 2204 or 2404 explicitly.
- Spare fleet capacity can bump a job up one tier for free, so single-run timings are noisy.
- Regions: us-east, us-west, eu-west, eu-central; org-wide, changed via support.
- Source: `https://docs.blacksmith.sh/blacksmith-runners/overview.md`

## Transparent cache

- Covers `actions/cache` (+ `/save`, `/restore`), `actions/setup-node|go|python|java`, `ruby/setup-ruby`, and popular third-party cache actions. No code change.
- **Not** covered: Rust `sccache`, and `docker/build-push-action`'s `type=gha` cache — those still go to GitHub's backend.
- 25 GB per repo per week free; LRU eviction of entries untouched for 7+ days.
- Branch-scoped like GitHub's (a PR can read the base branch's entries, not a sibling PR's). Can be switched off in the Blacksmith dashboard settings to share across branches.
- Manage entries: dashboard cache page, or `blacksmith cache list | delete | clear`.
- The old `useblacksmith/cache`, `useblacksmith/setup-*`, `useblacksmith/rust-cache` forks are **archived** — migrate back to upstream.

## Sticky disks — `useblacksmith/stickydisk@v1`

An ext4 volume cloned from the last committed snapshot and mounted in ~3 s regardless of size. Worth it only when the state is multi-GB and restore time dominates (huge `node_modules`, Bazel/Gradle/Nix stores, git mirrors).

```yaml
- uses: useblacksmith/stickydisk@v1
  with:
    key: ${{ github.repository }}-pnpm-store
    path: ~/.local/share/pnpm/store
```

- Max 5 sticky disks per job.
- Each job gets its own clone; its writes become the new snapshot on job completion — last writer wins, so concurrent jobs on one key lose each other's additions.
- **Poisoning risk**: by default any job, including `pull_request` ones, commits. Enable "Branch Protection" for sticky disks in the dashboard so only `push` / `schedule` / `workflow_dispatch` on the default branch commit; PR jobs still hydrate but their clone is discarded.
- Inside a `container:` job it needs `options: --privileged` plus the `VM_ID`, `GITHUB_REPO_NAME`, `BLACKSMITH_STICKYDISK_TOKEN`, `BLACKSMITH_INSTALLATION_MODEL_ID`, `BLACKSMITH_REGION` env vars passed through.
- Unlike the transparent cache, sticky-disk storage is a paid line item — check `https://www.blacksmith.sh/pricing` before adopting.
- Source: `https://docs.blacksmith.sh/blacksmith-caching/dependencies-sticky-disks.md`

## Docker layer caching

Swap two actions; the builder's whole disk persists between runs (sticky-disk backed):

```yaml
- uses: useblacksmith/setup-docker-builder@v2 # replaces docker/setup-buildx-action
  with:
    cache-key: path/to/Dockerfile # one key per build workload — unrelated images sharing a key evict each other
- uses: useblacksmith/build-push-action@v2 # replaces docker/build-push-action
  with:
    push: true # not load: true + docker push (handles every byte twice)
    tags: user/app:latest
```

- Remove any `cache-from` / `cache-to: type=gha` — redundant, and it routes to GitHub's slow backend.
- Not using `build-push-action` (plain `docker build`, bake, compose)? `setup-docker-builder` alone is enough.
- GC: layers unused for 8 days are dropped.
- Multi-arch: matrix over x64 + `-arm` labels, then merge manifests; no QEMU.
- `RUN --mount=type=cache` dirs persist too, since the builder disk persists.
- Source: `https://docs.blacksmith.sh/blacksmith-caching/docker-builds.md`

Also available, unused here: container-image pull caching, git checkout caching (mirror on a sticky disk — for very large repos), Bazel remote cache, static egress IP.

## Debugging tools

- **SSH into a running job** — opt-in per org (dashboard Settings → Features, org admin). The `Setup runner` step prints `ssh -p <port> runner@<host>.vm.blacksmith.sh`; auth is the GitHub SSH key of the user who triggered the run, nobody else. The VM dies with the job, so add a temporary `sleep` step (and remove it) to hold it open.
- **Dashboard** `app.blacksmith.sh` — run history, cross-job log search, per-job CPU/memory graphs, test analytics.
- **`blacksmith` CLI** — agent-friendly access to the same data. Not installed on the house machines by default; installing is `curl -fsSL https://get.blacksmith.sh | sh` — ask the user first.

  ```bash
  blacksmith auth login            # browser OAuth, token in ~/.blacksmith/credentials
  blacksmith jobs list --repo owner/repo --conclusion failure --since 7d --format table
  blacksmith jobs logs <job_id> --step "Run tests" --search "FAILED"
  blacksmith jobs stats <job_id>   # CPU p50–p99, memory timeseries, OOM events
  blacksmith jobs aggregate --repo owner/repo --group-by workflow,job_name --since 14d
  blacksmith jobs diagnose rightsize   # label-size diagnosis (see blacksmith-cli/jobs.md for flags)
  blacksmith cache list | delete | clear
  ```

  `jobs stats` / `aggregate` are the evidence to cite when proposing a label-size change (busy-fraction near 100% → go up; peak CPU < 50% on 4vcpu → go down).
- Without the CLI, `gh run view <id> --log-failed` works exactly as on GitHub-hosted runners.
- Outage check: `https://status.blacksmith.sh`.
