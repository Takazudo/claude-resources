---
name: subagent-creator
description: >
  Create new Claude Code custom agents (subagents). Use when: (1) User wants to create a new custom
  agent, (2) User says 'create agent', 'new agent', 'make subagent', (3) User wants a specialized
  agent for delegation. Covers: agent file format, YAML frontmatter fields, tool restrictions, model
  selection, permission modes, persistent memory, and placement.
---

# Create Custom Agent

## Agent File Format

Custom agents are **Markdown files with YAML frontmatter** stored in:

| Location | Scope |
|----------|-------|
| `~/.claude/agents/` | All projects (personal) |
| `.claude/agents/` | Current project only |

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Lowercase letters and hyphens identifier |
| `description` | Yes | What the agent does. Claude uses this to decide when to delegate |
| `model` | No | `sonnet`, `opus`, `haiku`, or `inherit` (default) |
| `tools` | No | Allowlist of tools. Inherits all if omitted. Use `Task(agent-name)` to restrict subagent spawning |
| `disallowedTools` | No | Denylist of tools |
| `permissionMode` | No | `default`, `acceptEdits`, `delegate`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Max agentic turns before stopping |
| `skills` | No | Skills to preload at startup |
| `mcpServers` | No | MCP servers available to agent |
| `hooks` | No | Lifecycle hooks scoped to agent |
| `memory` | No | `user`, `project`, or `local` - persistent memory across sessions |
| `color` | No | Color for UI display |

## Workflow

### Step 1: Understand the agent's purpose

Ask user:
- What tasks should this agent handle?
- Should it be personal (`~/.claude/agents/`) or project-scoped (`.claude/agents/`)?
- Does it need write access or is it read-only?

### Step 2: Choose appropriate settings

**Model selection:**
- `opus` - Complex reasoning, code review, architecture decisions
- `sonnet` - General development, balanced speed/quality
- `haiku` - Fast simple tasks, formatting, quick lookups

**Tool restrictions:**
- Read-only agent: `tools: Read, Grep, Glob`
- Developer agent: omit `tools` (inherits all)
- No web access: `disallowedTools: WebFetch, WebSearch`

**Key constraints:**
- Subagents CANNOT spawn other subagents (no nesting)
- Keep the body focused - it becomes the agent's system prompt

### Step 3: Create the agent file

Template:

```markdown
---
name: agent-name
description: One sentence describing when Claude should delegate to this agent
model: sonnet
tools: Read, Grep, Glob, Bash
---

You are a specialized [role]. [Core instruction in 1-2 sentences.]

## Responsibilities

[What this agent does - keep concise]

## Workflow

[Step-by-step procedure if applicable]
```

### Step 4: Format the agent file

Format the created agent file using the mdx-formatter to ensure consistent markdown formatting:

```bash
pnpm dlx @takazudo/mdx-formatter --write <path-to-agent-file.md>
```

### Step 5: Verify

After creating the file, verify:
1. File is at the correct location
2. YAML frontmatter parses correctly (no syntax errors)
3. Description clearly indicates when to use the agent

## Examples

### Read-only code explorer

```yaml
---
name: code-explorer
description: Explore and explain codebase architecture and patterns
tools: Read, Grep, Glob
model: sonnet
---

You are a codebase explorer. Analyze code structure,
explain architecture, and find patterns.
```

### Developer with memory

```yaml
---
name: project-dev
description: Project-aware developer that learns conventions over time
model: opus
memory: project
---

You are a developer for this project. Maintain memory of
conventions, patterns, and architectural decisions.
```

## Reference

- Agents are used via Task tool's `subagent_type` parameter
- Skills can use agents via `context: fork` + `agent: agent-name`
- Run directly: `claude --agent agent-name`
