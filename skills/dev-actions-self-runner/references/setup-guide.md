# Self-Hosted Runner Setup Guide

## WSL2 Runner Setup (Windows host)

### 1. Enable systemd in WSL2

Edit `/etc/wsl.conf`:

```ini
[boot]
systemd=true
```

Restart WSL2 from PowerShell: `wsl --shutdown` then `wsl`.

### 2. Register the runner

On GitHub: repo Settings > Actions > Runners > New self-hosted runner > **Linux** x64.

```bash
mkdir ~/actions-runner-REPONAME && cd ~/actions-runner-REPONAME
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64-2.322.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/OWNER/REPO --token <TOKEN>
```

### 3. Install as systemd service

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

### 4. Auto-start WSL2 on Windows boot

Windows Task Scheduler:

- Trigger: At startup
- Action: `wsl -d Ubuntu`
- Run whether user is logged on or not
- Run with highest privileges

### Native Linux Runner Setup

Same as steps 2-3 above, without WSL2-specific configuration.

## RUNNER_CHECK_TOKEN Setup

### Org-level runners (recommended)

Register runners at the **organization** level so they are shared across repos.

1. GitHub > Org Settings > Actions > Runners > New self-hosted runner
2. Fine-grained PAT: Org permissions > `Organization self-hosted runners: Read-only`
3. Save as repo or org secret `RUNNER_CHECK_TOKEN`

The detect-runner workflow checks org-level runners first, then falls back to repo-level. This way a single runner serves multiple repos in the org.

### Repo-level runners (alternative)

1. GitHub > Repo Settings > Actions > Runners > New self-hosted runner
2. Fine-grained PAT: Repo permissions > `Administration: Read-only`
3. Save as repo secret `RUNNER_CHECK_TOKEN`

### Classic PAT (legacy)

1. GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Scope: `repo`
3. Save as repo secret `RUNNER_CHECK_TOKEN`

## Tips for Self-Hosted Runners

### Avoid global installs — use pnpm dlx / npx

Self-hosted runners **persist state between runs** (unlike GitHub-hosted which start fresh). Global `npm install -g` can leave stale directories that cause `ENOTEMPTY` or version conflicts on the next run.

**Bad:**

```yaml
- name: Install wrangler
  run: npm install -g wrangler
- name: Deploy
  run: wrangler pages deploy ...
```

**Good:**

```yaml
- name: Deploy
  run: pnpm dlx wrangler pages deploy ...
```

This applies to any CLI tool used only in CI: `wrangler`, `vercel`, `netlify`, `firebase-tools`, etc. Use `pnpm dlx` (or `npx`) instead of installing globally.

### Cache behavior differs

- GitHub-hosted runners start clean — `actions/cache` and `setup-node` cache restore from network
- Self-hosted runners keep `node_modules`, `~/.cache/pnpm`, `~/.npm` across runs — caching is faster but stale state can accumulate
- Use `--frozen-lockfile` to prevent accidental dependency drift
- If builds behave differently on self-hosted vs GitHub-hosted, clear the runner's pnpm store: `pnpm store prune`

### One job at a time per runner

A single runner process handles one job at a time. If workflows have parallel jobs, only one runs while others queue.

**Mitigation options:**

- Register multiple runner instances in separate directories (`~/actions-runner-REPO-1`, `~/actions-runner-REPO-2`)
- Design workflows so heavy jobs run sequentially (e.g., quality → build → deploy chain)
- Keep lightweight jobs (detect-runner, notifications) on `ubuntu-latest` so they don't block the self-hosted queue

### Stale tool directories

If `npm install -g` or similar was used before and left stale files, clean up manually:

```bash
# Find and remove stale global modules from the runner's node tool cache
rm -rf ~/actions-runner-*/_work/_tool/node/*/x64/lib/node_modules/.package-*
```

### Docker container jobs won't work

Jobs using `container:` in the workflow need Docker. Most self-hosted runners (especially macOS and WSL2) don't have Docker configured. Keep container-based jobs on `ubuntu-latest`.

### Security considerations

- Self-hosted runners have **full access to the host machine** — only use with trusted repos
- Public repos should **never** use self-hosted runners (anyone can open a PR and run code on your machine)
- Keep runners in private repos or repos with protected branches only

## Key Constraints

- **Docker container jobs** (`container:` in workflow) work on WSL2 self-hosted runners with Docker installed, but require a permissions cleanup step — see [self-hosted-gotchas.md](self-hosted-gotchas.md)
- **Cache keys** use `runner.os` — caches won't cross-hit between Linux (GitHub-hosted) and macOS/Windows (self-hosted)
- **One runner per repo** for personal accounts; org-level sharing for GitHub Organizations (free tier)
- **One job at a time** per runner instance; parallel jobs need multiple runner instances in separate directories
- The runner is a process, not a container — full access to machine resources
- **Stale workspace state** persists between jobs — see [self-hosted-gotchas.md](self-hosted-gotchas.md) for cleanup patterns
