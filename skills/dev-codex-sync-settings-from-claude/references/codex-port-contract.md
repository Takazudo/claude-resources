# Codex Port Contract

House style and adaptation rules for turning a Claude Code skill into a Codex-native `SKILL.md`. Follow this for every port and refresh.

## Condensation

A port is a REWRITE, not a copy. Keep only decision-driving procedure; cut Claude-harness minutiae, repetition, and anything a capable agent already knows. Target ~40–150 lines (Claude sources run 200–1100).

## House style (match the existing Codex ports)

- Frontmatter: only `name` and `description`. `description` is one quoted line — what it does + when to use it.
- Body opens with `# <name>` then one line: `` Codex-native version of your Claude `<skill>` workflow. ``
- Sections, as relevant (omit what doesn't apply): **Intent**, **Input Shape** (flags + args), **Codex Mapping**, **Related Skills**, **Workflow** (numbered), plus skill-specific sections (Branch And PR Rules, Review Mode, When Not To Use, Missing Skill Fallbacks, …).
- Tone: concise, imperative, high-freedom. Explain *why* once instead of piling on MUST / ALWAYS / NEVER.

## Codex agent primitives

Codex has no Claude Task tool or agent teams. Translate:

| Claude concept | Codex primitive |
| --- | --- |
| create team / child agent | `spawn_agent` (with `agent_type`, e.g. `"worker"`) |
| message a child | `send_input` |
| wait on / monitor a child | `wait_agent` (use sparingly) |
| shut down a child | `close_agent` |
| child persona / prompt | prompt embedded in `spawn_agent` |

Never tell the user to open worktrees or start child sessions by hand.

## Flag vocabulary — preserve verbatim

Keep the user's Claude flag spellings so habits transfer. Include only the flags a given skill actually uses:

`-a`/`--auto`, `-m`/`--merge`, `-po`/`--plan-only`, `-lo`/`--local`, `-l`/`--review-loop`, `-v`/`--verify-ui`, `-nf`/`--no-fix`, `-nori`/`--no-raise-issues`, `-f`/`--fix`, `-ri`/`--raise-issues`, `-s`/`--stay`, `--no-issue`, `--make-issue`/`--issue`.

`-a` and `-m` are orthogonal (full hands-off = `-a -m`). `-lo` (local) is distinct from `-l` (review-loop) — never conflate the short tokens.

## Canonical Codex skill names

Use these exact names in every "Related Skills" / routing section:

`big-plan`, `cleanup-resources`, `x`, `x-as-pr`, `x-wt-teams` (canonical), `x-wt-team` (alias), `deep-review` (alias → codex-review), `review-loop`, `verify-ui` (external — from `Takazudo/zudo-test-wisdom`, not a `$HOME/.claude` port; reference only where installed), `watch-ci`, `pr-revise`, `gh-fetch-issue`, `codex-2nd`, `codex-review`, `codex-research`, `codex-writer`.

End every "Related Skills" list with: "If one of these related skills does not exist on the Codex side yet, keep going with the equivalent behavior directly in the current session instead of blocking."

## Adapting Claude-only concepts

- **Opus-based reviewers** (`opus-2nd`, `-op`): no Codex equivalent → map plan/second-opinion review to `codex-2nd` (a fresh independent Codex pass). Mention `-op` only as "approximate with a second codex-2nd pass" when the source leans on it.
- **Per-task model picks** (opus/sonnet/haiku annotations): drop them — Codex doesn't switch models per sub-task. Keep the execution-mode annotation (independent worker vs needs coordination); it drives how the downstream skill spawns children.
- **Sonnet/Haiku subagents** (e.g. cleanup, commits): → an inline in-session pass, or a `spawn_agent` worker when scope warrants.
- Never leave a dangling Claude-only instruction. When unsure, state the Codex equivalent inline.

## Writing gh bodies — no literal `\n`

Any port that creates or edits a PR / issue / comment body MUST tell the agent to compose multi-line bodies in a file and pass `--body-file`, never an inline `--body "…\n…"`. Inline `\n` stays literal through the shell and `gh` and ships as visible `\n\n` in the rendered body (a real past failure — e.g. zudo-doc PR bodies rendered with raw `\n\n`). Include a short heredoc example (`gh … --body-file "$f"`). Applies to `gh pr create`, `gh issue create`, `gh pr edit`, `gh issue edit`, and multi-line `gh {pr,issue} comment`. Skills that already carry a "Writing gh bodies" section: `x-as-pr`, `big-plan`, `x-wt-teams`, `pr-revise` — keep it on refresh.

## Naming conventions

- The user types `/x-wt-teams` (plural) — that is the canonical skill holding the real content. `x-wt-team` (singular) is a thin alias pointing to it. Keep both so either invocation works.
- An alias is a ~10-line stub: frontmatter + "Alias for `` `<canonical>` ``." + one line telling the reader to use the canonical skill's behavior.
