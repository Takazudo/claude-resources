# Reviewer Backend Modes

Full substitution rules for `-co` / `-gco` / `-gcoc`, plus the combined-mode behavior. The skill body links here from Step 1 (planning), Step 5 (child self-review), and Step 9 (final quality assurance).

Backend flags are **NOT mutually exclusive** with each other. They ARE orthogonal to model flags (`-haiku` / `-so` / `-op`).

## Codex Mode (`-co` / `--codex`)

| Default tool | Codex replacement | Used for |
|---|---|---|
| `/deep-review` | `/codex-review` | Step 9 quality assurance (manager review) |
| `/review-loop N --aggressive` | `/codex-review` (run once) | Review-loop mode review step |
| `/light-review` in child agents (Step 5) | `/light-review -co` | Child agent self-review (routes to `/codex-review`) |
| Agent tool (web search, research) | `/codex-research` | Web search or codebase research during planning/implementation |
| Agent tool (doc writing) | `/codex-writer` | Writing README, doc comments, prose content |

**Effect on workflow:**

- **Step 5 (child agents)**: Children run `/light-review -co` for self-review. `/light-review` dispatches to `/codex-review` under the hood.
- **Step 9 (quality assurance)**: Invoke `/codex-review` instead of `/deep-review` or `/review-loop`. If `-l` / `--review-loop` is also passed, still invoke `/codex-review` once (not multiple rounds — codex review is already thorough).
- **Research during planning**: Prefer `/codex-research` over Agent tool / WebSearch.
- **Documentation writing**: Prefer `/codex-writer`.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

| Default tool | GCO replacement | Used for |
|---|---|---|
| `/deep-review` | `/gco-review` | Step 9 quality assurance |
| `/review-loop N --aggressive` | `/gco-review` (run once) | Review-loop mode |
| `/light-review` in child agents | `/light-review -gco` | Child self-review (routes to `/gco-review`) |
| `/codex-2nd` (planning phase) | `/gco-2nd` | Second opinion |
| Agent tool (web search, research) | `/gco-research` | Web/codebase research |

**Effect on workflow:**

- **Step 5**: Children use `/gco-review` for self-review. `/gco-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed.
- **Step 9**: Invoke `/gco-review`. If `-l` is also passed, still run once.
- **Planning 2nd opinion**: Use `/gco-2nd` instead of `/codex-2nd`. Silent skip on rate limits is fine.
- **Research**: Prefer `/gco-research` over Agent tool / WebSearch.

## GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). Use when Premium quota is exhausted or the task is simple enough that `gpt-4.1` feedback suffices.

| Default tool | GCOC replacement | Used for |
|---|---|---|
| `/deep-review` | `/gcoc-review` | Step 9 |
| `/review-loop N --aggressive` | `/gcoc-review` (run once) | Review-loop mode |
| `/light-review` in child agents | `/light-review -gcoc` | Child self-review |
| `/codex-2nd` | `/gcoc-2nd` | Second opinion |
| Agent tool (web search, research) | `/gcoc-research` | Research |

Behavior matches `-gco` mode — substitute `gcoc` for `gco` in the substitutions above. Pass the `-gcoc` flag context to children so they select the cheap variant.

## Combined Reviewer Mode (multiple backend flags)

The backend flags `-co`, `-gco`, and `-gcoc` are **NOT mutually exclusive** — they can be freely combined. When the user passes more than one (e.g., `-co -gcoc -gco`), run **all** selected reviewer backends. Multiple independent reviewers from different backends catch different classes of issues; combining them is an explicit quality-coverage choice.

**Rule: if multiple backend flags are passed, run them all — never pick one and drop the others.** Do not treat as redundant or "pick the best." The user is paying (in time, in quota) for multi-angle review on purpose.

### Which backends → which reviewers

| Flag present | Reviewer invoked | 2nd-opinion invoked | Child self-review flag |
|---|---|---|---|
| `-co` | `/codex-review` | `/codex-2nd` | `-co` |
| `-gco` | `/gco-review` | `/gco-2nd` | `-gco` |
| `-gcoc` | `/gcoc-review` | `/gcoc-2nd` | `-gcoc` |

### How combinations apply per affected step

- **Step 5 (child self-review)**: Forward every active backend flag to `/light-review`. Example: `/light-review -co -gco -gcoc`. `/light-review` dispatches to each backend's reviewer in turn (or falls back silently for unavailable backends). If the child only supports one flag at a time, fire `/light-review` once per backend sequentially.
- **Step 9 (quality assurance)**: Invoke each selected reviewer **sequentially** on the same `base/<project-name>` branch. Collect findings from every run into a single combined fix issue before delegating fixes. Do not stop after the first reviewer — even if it reports "no issues," still run the others. If `-l` / `--review-loop` is also passed, each backend still runs once (no multi-round per backend).
- **Planning 2nd opinion**: When multiple backend flags are active, invoke every matching `*-2nd` command in sequence and read all of their feedback before finalizing the plan. Silent fallbacks (rate limits, unavailable CLIs) are fine — do not block on them.
- **Research and doc writing (`-co` interactions)**: When `-co` is combined with `-gco` / `-gcoc`, codex still owns `/codex-research` and `/codex-writer` for research and docs. For research specifically, you MAY additionally invoke `/gco-research` / `/gcoc-research` in parallel when the topic benefits from cross-source coverage — optional. Only `/codex-review` vs `/gco-review` vs `/gcoc-review` are **required** to all run.

### Single-flag fallback

If only one backend flag is passed, behave exactly as the single-mode sections above (Codex Mode / GCO Mode / GCOC Mode). Combined Reviewer Mode activates only when ≥2 backend flags are present on the invocation.

## Review Findings to Fix — combined-mode template

When creating the fix issue in Step 9, label findings by their source backend so the fix agent can weight them. Agreements (multiple backends flagging the same issue) are stronger signals; disagreements are judgment calls:

```markdown
## Review Findings to Fix

### From /codex-review
- ...

### From /gco-review
- ...

### From /gcoc-review
- ...
```

This preserves the quality-coverage benefit of running multiple reviewers — the fix agent sees per-backend grouping rather than a flattened, homogenized list.
