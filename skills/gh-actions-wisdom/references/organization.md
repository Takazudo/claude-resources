# Workflow Organization

## Reusable Workflows vs Composite Actions

| Feature              | Reusable Workflow          | Composite Action          |
| -------------------- | -------------------------- | ------------------------- |
| Runs as              | Separate job               | Steps within a job        |
| Own runner            | Yes                        | No (uses caller's runner) |
| Access secrets        | Yes (passed or inherited)  | No (uses caller's)        |
| Nesting               | Up to 4 levels             | Up to 10 levels           |
| Best for              | Standardizing pipelines    | Sharing step sequences    |

### Reusable Workflow Example

```yaml
# .github/workflows/reusable-deploy.yml
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
    secrets:
      DEPLOY_TOKEN:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: deploy --env ${{ inputs.environment }}
        env:
          TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

```yaml
# Caller workflow
jobs:
  deploy:
    uses: ./.github/workflows/reusable-deploy.yml
    with:
      environment: production
    secrets:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

### Composite Action Example

```yaml
# .github/actions/setup-project/action.yml
name: Setup Project
runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .node-version
        cache: pnpm
    - run: pnpm install --frozen-lockfile
      shell: bash
```

```yaml
# Usage in workflow
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/setup-project
  - run: pnpm build
```

## When to Split Workflows

Split when:

- **Different triggers**: PR checks vs deploy vs scheduled tasks
- **Different permissions**: Read-only CI vs write-access deploy
- **Independent execution**: Lint/test don't need to block deploy notification
- **File exceeds 200-300 lines**: Hard to maintain

Don't split when:

- Coordination would require `workflow_run` chains (adds fragility)
- Jobs share artifacts that are expensive to re-upload
- The split creates more complexity than it solves

## Common Workflow Structure

```
.github/workflows/
├── pr-checks.yml          # Lint, typecheck, test on PRs
├── main-deploy.yml        # Build and deploy on push to main
├── preview-deploy.yml     # Deploy PR previews
├── detect-runner.yml      # Self-hosted runner detection (reusable)
└── security.yml           # Scheduled security audits (weekly)
```

## Naming Conventions

- Use descriptive kebab-case names: `pr-checks.yml`, `main-deploy.yml`
- Prefix with trigger context: `pr-`, `main-`, `schedule-`
- Use `name:` field for human-readable display in GitHub UI
