# ccdoc — Claude Code Documentation Viewer

Astro 5 site + Electron app for browsing Claude Code global resources.

## Tech Stack

- **Astro 5** — static site with content collections reading from `~/.claude/`
- **Tailwind CSS v4** — via `@tailwindcss/vite`
- **Electron** — thin wrapper around dev server (port 9987)
- **pnpm workspaces** — `site/` and `electron-app/`

## Commands

- `pnpm start` — Astro dev server on port 9987
- `pnpm build` — static build to `site/dist/`
- `pnpm app` — launch Electron app (starts dev server automatically)

## Content Collections

Defined in `site/src/content.config.ts`. Four collections read directly from `~/.claude/`:

| Collection | Source | Loader |
|---|---|---|
| `claudeCommands` | `~/.claude/commands/*.md` | glob |
| `claudeAgents` | `~/.claude/agents/*.md` | glob |
| `claudeSkills` | `~/.claude/skills/*/SKILL.md` | custom (gray-matter, YAML error tolerance) |
| `claudeMd` | `~/.claude/**/CLAUDE.md` | custom (recursive finder) |

## Key Files

```
site/src/
├── content.config.ts    # Collection definitions + custom loaders
├── components/sidebar.astro
├── layouts/layout.astro
├── pages/               # File-based routing for each collection
├── styles/global.css    # Dracula theme tokens + typography
└── utils/render-markdown.ts  # marked-based renderer for custom loader content
```

## Notes

- Astro's `glob()` loader watches external directories natively — no custom file watcher needed
- Custom loader content uses `marked` for HTML rendering (`render()` from astro:content doesn't work for custom loaders)
- Tailwind v4 responsive utilities don't generate from `.astro` files — use plain CSS `@media` queries instead
