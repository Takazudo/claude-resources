# Reviewer Backend Modes

Full substitution rules for `-co` / `-gco`, plus the combined-mode behavior with Claude reviewer model flags (`-op` / `-so` / `-haiku`). The skill body links here from Step 1 (planning), Step 5 (child self-review), and Step 9 (final quality assurance).

All reviewer flags — both Claude model (`-op` / `-so` / `-haiku`) and non-Claude backend (`-co` / `-gco`) — are reviewer-changers. They are **NOT mutually exclusive** with each other; passing multiple means run them all.

These flags are orthogonal to team-member flags (`-t-op` / `-t-so`), which govern child agents and fix-delegation agents — not reviewers. See `references/arguments.md` for the two-family distinction.

## Codex Mode (`-co` / `--codex`)

| Default tool | Codex replacement | Used for |
|---|---|---|
| `/deep-review` | `/codex-review` | Step 9 quality assurance (manager review) |
| `/review-loop N` | `/codex-review` (run once) | Review-loop mode review step |
| `/light-review` in child agents (Step 5) | `/light-review -co` | Child agent self-review (routes to `/codex-review`) |
| Agent tool (web search, research) | `/codex-research` | Web search or codebase research during planning/implementation |
| Agent tool (doc writing) | `/codex-writer` | Writing README, doc comments, prose content |

**Effect on workflow:**

- **Step 5 (child agents)**: Children run `/light-review -co` for self-review. `/light-review` dispatches to `/codex-review` under the hood.
- **Step 9 (quality assurance)**: Invoke `/codex-review` instead of `/deep-review` or `/review-loop`. If `-l` / `--review-loop` is also passed, still invoke `/codex-review` once (not multiple rounds — codex review is already thorough).
- **Research during planning**: Prefer `/codex-research` over Agent tool / WebSearch.
- **Documentation writing**: Prefer `/codex-writer`.

**Silent Opus fallback** — every codex-backed skill (`/codex-review`, `/codex-2nd`, `/codex-research`, `/codex-writer`) silently falls back to a subagent at `model: opus` when codex is rate-limited or unavailable. No special handling needed at the dispatcher level — the fallback is invisible. The `-co` flag means "the better reviewer/tool"; Opus is the Claude-side stand-in when codex is down.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

| Default tool | GCO replacement | Used for |
|---|---|---|
| `/deep-review` | `/gco-review` | Step 9 quality assurance |
| `/review-loop N` | `/gco-review` (run once) | Review-loop mode |
| `/light-review` in child agents | `/light-review -gco` | Child self-review (routes to `/gco-review`) |
| `/codex-2nd` (planning phase) | `/gco-2nd` | Second opinion |
| Agent tool (web search, research) | `/gco-research` | Web/codebase research |

**Effect on workflow:**

- **Step 5**: Children use `/gco-review` for self-review. `/gco-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed.
- **Step 9**: Invoke `/gco-review`. If `-l` is also passed, still run once.
- **Planning 2nd opinion**: Use `/gco-2nd` instead of `/codex-2nd`. Silent skip on rate limits is fine.
- **Research**: Prefer `/gco-research` over Agent tool / WebSearch.

## Combined Reviewer Mode (multiple reviewer flags)

All reviewer flags — Claude model (`-op` / `-so` / `-haiku`) and non-Claude backend (`-co` / `-gco`) — combine freely. When the user passes more than one, run **all** selected reviewers. Multiple independent reviewers catch different classes of issues; combining them is an explicit quality-coverage choice.

**Rule: if multiple reviewer flags are passed, run them all — never pick one and drop the others.** Do not treat as redundant or "pick the best." The user is paying (in time, in quota) for multi-angle review on purpose.

### Which flag → which reviewer

| Flag present | Reviewer invoked | 2nd-opinion invoked | Child self-review flag |
|---|---|---|---|
| `-op` / `-so` / `-haiku` | `/deep-review` (or `/review-loop`) at the chosen Claude model | `/codex-2nd` (default planning 2nd opinion still uses codex unless a backend flag overrides) | none — `/light-review` falls back to its own default |
| `-co` | `/codex-review` | `/codex-2nd` | `-co` |
| `-gco` | `/gco-review` | `/gco-2nd` | `-gco` |

When **no reviewer flag** is passed at all, the default reviewer is `/codex-review` (`-co` is the house default — `/deep-review` invoked with no flags delegates to it). Single backend flag without any Claude model flag replaces the default — does NOT also run Claude reviewers.

To explicitly run BOTH Claude reviewer AND a backend reviewer, pass at least one Claude model flag together with the backend flag (e.g., `-op -gco`).

### How combinations apply per affected step

- **Step 5 (child self-review)**: Forward every active backend flag to `/light-review`. Example: `/light-review -co -gco`. `/light-review` dispatches to each backend's reviewer in turn (or falls back silently for unavailable backends). If the child only supports one flag at a time, fire `/light-review` once per backend sequentially.
- **Step 9 (quality assurance)**: Invoke each selected reviewer **sequentially** on the same `base/<project-name>` branch. Collect findings from every run into a single combined fix issue before delegating fixes. Do not stop after the first reviewer — even if it reports "no issues," still run the others. If `-l` / `--review-loop` is also passed, each backend still runs once (no multi-round per backend).
- **Planning 2nd opinion**: When multiple backend flags are active, invoke every matching `*-2nd` command in sequence and read all of their feedback before finalizing the plan. Silent fallbacks (rate limits, unavailable CLIs) are fine — do not block on them.
- **Research and doc writing (`-co` interactions)**: When `-co` is combined with `-gco`, codex still owns `/codex-research` and `/codex-writer` for research and docs. For research specifically, you MAY additionally invoke `/gco-research` in parallel when the topic benefits from cross-source coverage — optional. Only `/codex-review` and `/gco-review` are **required** to both run.

### Single-flag fallback

If only one backend flag is passed, behave exactly as the single-mode sections above (Codex Mode / GCO Mode). Combined Reviewer Mode activates only when ≥2 backend flags are present on the invocation.

## Review Findings to Fix — combined-mode template

When creating the fix issue in Step 9, label findings by their source backend so the fix agent can weight them. Agreements (multiple backends flagging the same issue) are stronger signals; disagreements are judgment calls:

```markdown
## Review Findings to Fix

### From /codex-review
- ...

### From /gco-review
- ...
```

This preserves the quality-coverage benefit of running multiple reviewers — the fix agent sees per-backend grouping rather than a flattened, homogenized list.
