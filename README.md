# claude-resources

My personal [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configuration: custom commands, skills, agents, hooks, and scripts.

## What's in here

| Directory | Description |
|-----------|-------------|
| `commands/` | Custom slash commands (`/commits`, `/pr`, `/purge-private-info`, etc.) |
| `skills/` | Skills — modular packages that extend Claude's capabilities |
| `agents/` | Custom subagent definitions (code-reviewer, tdd-developer, etc.) |
| `hooks/` | Hook scripts (e.g., IFTTT notification on stop) |
| `scripts/` | Utility scripts (security checks, skill tooling) |
| `doc/` | Docusaurus documentation site for browsing the resources |
| `CLAUDE.md` | Global instructions applied to all projects |

## Usage

Feel free to browse and borrow anything useful. To use a skill or command in your own setup, copy it into your `~/.claude/` directory:

```
~/.claude/
├── commands/    # place command .md files here
├── skills/      # place skill directories here
├── agents/      # place agent .md files here
├── hooks/       # place hook scripts here
└── scripts/     # place utility scripts here
```

Refer to the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code) for details on how commands, skills, and agents work.

## Disclaimer

This is my personal configuration, shared as-is. Some resources may reference my specific environment or workflows. Use at your own risk — review and adapt to your own needs before using.

## License

MIT
