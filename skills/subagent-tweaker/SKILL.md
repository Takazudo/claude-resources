---
name: subagent-tweaker
description: >
  Fix, improve, or update existing Claude Code custom agents (subagents). Use when: (1) User reports
  an agent isn't working well, (2) User wants to adjust agent behavior, tools, or model, (3) User
  says 'fix agent', 'update agent', 'tweak agent', 'agent not working'. Handles: editing agent
  frontmatter, adjusting tool restrictions, updating prompts, debugging issues.
---

# Tweak Custom Agent

## Workflow

### Step 1: Identify the agent

Find agents at:
- `~/.claude/agents/*.md` (personal)
- `.claude/agents/*.md` (project)

Read the agent file to understand current configuration.

### Step 2: Diagnose the issue

Common problems and fixes:

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Agent not being used | Poor `description` | Rewrite with clear trigger keywords |
| Agent too slow | Wrong `model` | Switch to `sonnet` or `haiku` |
| Agent can't edit files | `tools` missing Write/Edit | Add needed tools to allowlist |
| Agent doing too much | No tool restrictions | Add `tools:` or `disallowedTools:` |
| Agent forgets context | No persistent memory | Add `memory: user` or `memory: project` |
| Agent runs too long | No turn limit | Add `maxTurns: N` |

### Step 3: Apply changes

Edit the agent's Markdown file. Preserve existing content that works well.

**Frontmatter fields reference:**

| Field | Description |
|-------|-------------|
| `name` | Identifier (lowercase, hyphens) |
| `description` | When to use (Claude reads this for delegation) |
| `model` | `opus`, `sonnet`, `haiku`, `inherit` |
| `tools` | Tool allowlist (inherits all if omitted) |
| `disallowedTools` | Tool denylist |
| `permissionMode` | `default`, `acceptEdits`, `delegate`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | Max agentic turns |
| `skills` | Preloaded skills |
| `mcpServers` | Available MCP servers |
| `hooks` | Scoped lifecycle hooks |
| `memory` | `user`, `project`, `local` |

### Step 4: Verify

After editing:
1. Confirm YAML frontmatter has no syntax errors
2. Check tool restrictions match intended behavior
3. Verify description contains keywords users would say

## Tips

- Keep agent body (system prompt) focused and concise
- Subagents cannot nest - don't add `Task` tool to agents that will be spawned as subagents
- When adjusting tools, prefer `disallowedTools` over `tools` if only blocking a few
- `description` is the primary trigger mechanism - this is the most impactful field to improve
