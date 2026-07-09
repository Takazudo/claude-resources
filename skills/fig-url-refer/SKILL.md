---
name: fig-url-refer
description: Read a Figma design node directly from a share URL via the Figma REST API — no Dev Mode subscription, no MCP, no desktop app. Renders the node to PNG and dumps its full style/layout JSON so the design can be described, compared, or implemented. Use whenever the user gives a Figma design URL (figma.com/design/... or /file/...) and wants to see, read, inspect, reference, or implement that node — including `/fig-url-refer <url>`. This is the URL-based counterpart to `/figrefer` (which needs a Dev-plan desktop MCP); prefer this one when the input is a URL rather than a live desktop selection.
argument-hint: <figma-url>
---

# fig-url-refer

Read one Figma node from its share URL using the REST API. The REST API only checks file access (not seat type), so a free Figma account can read any file it can open — this works without a Dev-mode subscription.

## Prerequisite: token

A Figma personal access token in `FIGMA_API_TOKEN`. The script finds it from the environment, or by reading `$HOME/.zshenv` / `.zshrc` / `.zshrc.local` / `.zprofile`, or via interactive zsh — so a token exported in any of those "just works" even though this script runs in a non-interactive shell.

If the script reports the token is missing, tell the user to add one:

- Figma → Settings → Security → **Personal access tokens** → generate (scope: **File content, read-only**)
- Add `export FIGMA_API_TOKEN=figd_...` to `$HOME/.zshrc` (or `.zshrc.local`)

## Step 1: Fetch the node

Run the script with the URL. Pass `--out-dir` pointing at the session scratchpad so artifacts stay out of the repo:

```bash
python3 "$HOME/.claude/skills/fig-url-refer/scripts/fig-fetch.py" "<figma-url>" --out-dir "<scratchpad-dir>"
```

Options: `--scale N` (PNG resolution, default 2), `--format svg` (vector instead of PNG). The URL must contain a `node-id` — that's present when the user copies a link to a selected layer. The script converts the URL's `node-id` hyphen form (`12671-1784`) to the API's colon form automatically.

It prints:

```
IMG:  <path to rendered png/svg>
JSON: <path to full node json>
name / type / size / children
```

## Step 2: Look at the design

Read the `IMG:` path — that's the visual reference. For exact values (colors, fonts, spacing, radii, text content), read the `JSON:` file, or grep it when it's large:

- `fills` / `strokes` → colors, `characters` → text content, `style` or `fontName` / `fontSize` / `fontWeight` → typography
- `itemSpacing` / `padding*` / `layoutMode` → auto-layout spacing, `cornerRadius` → radii, `effects` → shadows/blur

## Step 3: Do what the user asked

Summarize what the node looks like (visual + key styles + structure), then act on the request — commonly:

- **implement it** → write code in the current project's stack (adapt colors/spacing/type from the JSON; don't copy any framework the design tool would suggest)
- **describe / extract tokens** → report the concrete style values
- **compare with my code** → read the relevant project files and diff against the design

With no explicit instruction, present what you see and ask what they'd like to do.
