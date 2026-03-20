# Security Best Practices

## Action Pinning (Critical)

### The March 2025 Supply Chain Attack

`tj-actions/changed-files` (CVE-2025-30066): attackers compromised a PAT, rewrote existing version tags to inject malicious code, exfiltrated secrets from 23,000+ repositories. CISA issued an advisory.

### How to Pin

```yaml
# WRONG - mutable tag
- uses: actions/checkout@v4

# RIGHT - immutable SHA with version comment for readability
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

Use `step-security/secure-repo` or `pin-github-action` tool to automate SHA pinning.

## Permissions

### Always Declare Explicitly

```yaml
# Workflow-level default
permissions:
  contents: read

jobs:
  deploy:
    # Job-level override where needed
    permissions:
      contents: read
      pages: write
      id-token: write
```

### Common Permission Sets

| Scenario         | Permissions needed                         |
| ---------------- | ------------------------------------------ |
| Read-only CI     | `contents: read`                           |
| PR comment       | `contents: read`, `pull-requests: write`   |
| Pages deploy     | `contents: read`, `pages: write`, `id-token: write` |
| Release publish  | `contents: write`                          |
| Package publish  | `contents: read`, `packages: write`        |

## `pull_request_target` Danger

`pull_request_target` runs in the context of the base branch with access to secrets. **Never checkout PR code with it.**

```yaml
# DANGEROUS - gives fork code access to secrets
on: pull_request_target
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # NEVER DO THIS

# SAFE - only access base branch code
on: pull_request_target
jobs:
  label:
    steps:
      - uses: actions/labeler@v5 # No checkout of PR code
```

## Script Injection Prevention

User-controlled values (PR titles, branch names, commit messages) can contain shell metacharacters.

```yaml
# VULNERABLE - direct interpolation
- run: echo "PR title: ${{ github.event.pull_request.title }}"

# SAFE - bind to environment variable
- run: echo "PR title: $PR_TITLE"
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
```

## Secrets Handling

```yaml
# WRONG - exposes all secrets to called workflow
jobs:
  deploy:
    uses: ./.github/workflows/deploy.yml
    secrets: inherit

# RIGHT - pass only needed secrets
jobs:
  deploy:
    uses: ./.github/workflows/deploy.yml
    secrets:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

## OIDC Authentication

Prefer OIDC over long-lived secrets for cloud providers.

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789:role/deploy
      aws-region: us-east-1
```
