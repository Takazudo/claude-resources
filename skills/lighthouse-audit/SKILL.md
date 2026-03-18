---
name: lighthouse-audit
description: >-
  Run Lighthouse audits on a project's built site, create a GitHub issue with findings, then
  optionally fix issues via /x-wt-teams. Use when: (1) User says 'lighthouse audit', 'lighthouse',
  'performance audit', or 'audit website', (2) User wants to improve web performance, accessibility,
  SEO, or best practices, (3) User says 'lighthouse-audit'. Takes optional URL argument; default
  flow builds project and serves locally.
argument-hint: "[url] [--desktop] [--mobile] [--both]"
user-invocable: true
---

# Lighthouse Audit

Run Lighthouse audits, report findings as a GitHub issue, then improve the site via agent teams.

```
Phase 1: Audit  -->  Phase 2: Report  -->  Phase 3: Improve  -->  Phase 4: Verify
(build+serve,       (GitHub issue,         (/x-wt-teams on       (re-audit,
 run lighthouse)     summary to user)       the issue)             compare scores)
```

## Phase 1: Audit

### Step 1: Detect project type

Read `package.json` to determine build and serve commands:

| Project Type | Build Command | Serve Command |
| --- | --- | --- |
| Next.js (static) | `next build` | `npx serve out` |
| Next.js (server) | `next build` | `next start -p 3456` |
| Docusaurus | `docusaurus build` | `npx serve build -l 3456` |
| Vite | `vite build` | `vite preview --port 3456` |
| Gatsby | `gatsby build` | `npx serve public -l 3456` |
| Generic | `npm run build` | `npx serve <output-dir> -l 3456` |

Use the project's package manager. Prefer `preview`/`serve` scripts from package.json over `npx serve`.

### Step 2: Build and serve

```bash
pnpm run build
npx serve <build-dir> -l 3456 &
SERVER_PID=$!
sleep 3
```

Use port `3456` to avoid conflicts. Remember `$SERVER_PID` to kill later.

### Step 3: Discover pages

Pick 3-5 representative pages from:

1. `<build-dir>/sitemap.xml`
2. `src/pages/` or `app/` directory structure
3. Common pages: `/`, `/about`, `/docs`, first blog post
4. User-provided URLs (if argument given)

Always include homepage.

### Step 4: Run Lighthouse

Determine preset from argument: `--desktop`, `--mobile`, or `--both` (default: `--both`).

```bash
REPORT_DIR=~/cclogs/<repo-name>/lighthouse-$(date +%Y%m%d_%H%M%S)
mkdir -p "$REPORT_DIR"

bash ~/.claude/skills/lighthouse-audit/scripts/run-lighthouse.sh \
  "$REPORT_DIR/mobile" mobile \
  http://localhost:3456/ http://localhost:3456/page2

bash ~/.claude/skills/lighthouse-audit/scripts/run-lighthouse.sh \
  "$REPORT_DIR/desktop" desktop \
  http://localhost:3456/ http://localhost:3456/page2
```

### Step 5: Kill server and parse

```bash
kill $SERVER_PID 2>/dev/null
```

Read `summary.json` files from each report directory.

## Phase 2: Report

### Create GitHub issue

Create an issue with structured audit results:

```bash
gh issue create --title "Lighthouse Audit Report - $(date +%Y-%m-%d)" --body "..."
```

Issue body should include:

- **Scores table**: Page x Preset x Category matrix
- **Top opportunities**: Grouped by category with potential savings
- **Recommendations**: Grouped into logical topics suitable for parallel worktree tasks (e.g., "image optimization", "render-blocking resources", "accessibility fixes", "meta tags")

### Report to user

Present concise summary: score table, top 3-5 actionable items. Ask if user wants to proceed with improvements.

## Phase 3: Improve

If user proceeds:

1. Invoke `/x-wt-teams --stay <issue-url>` with improvement instructions from the audit
2. Each recommendation topic becomes a worktree with a child agent

Example:

```
/x-wt-teams --stay <issue-url>
Implement Lighthouse improvements from the issue:
1. Image optimization: compress, add dimensions, next-gen formats
2. Render-blocking: defer non-critical CSS/JS, inline critical CSS
3. Accessibility: alt attributes, color contrast, ARIA labels
4. SEO: meta descriptions, heading hierarchy
```

## Phase 4: Verify

After agent teams complete:

1. Rebuild and re-serve the project
2. Re-run Lighthouse on same pages with same presets
3. Compare with bundled script:

```bash
bash ~/.claude/skills/lighthouse-audit/scripts/compare-reports.sh \
  "$REPORT_DIR/mobile/summary.json" \
  "$NEW_REPORT_DIR/mobile/summary.json"
```

4. Report before/after comparison to user
5. Comment on the GitHub issue with results

## Notes

- Each audit takes ~30-60s per page per preset
- Limit to 5 pages for large sites
- If user provides a live URL, skip build+serve steps
- Reports saved to `~/cclogs/<repo-name>/`
