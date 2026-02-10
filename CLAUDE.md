# Global Instructions

## Tools & Runtime

- Check the project's package manager (pnpm, npm, etc.) before running install or script commands
- `gh` CLI for GitHub operations (PRs, issues, API)

## Code Style

- Prefer kebab-case for file names to avoid case-sensitivity issues, unless the project uses a different convention

## Git Safety

- No force push, no `--amend` unless explicitly permitted
- No branch name reuse. Regular merge by default (not squash)

## Safety

- `rm -rf`: relative paths only (`./path`, never `/absolute/path`)
- Temp files go to `__inbox/` (gitignored), never repo root
