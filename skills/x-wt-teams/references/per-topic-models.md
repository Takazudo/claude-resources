# Per-Topic Models — Resolution

How `/x-wt-teams` decides which Claude model each child should run. Read when the spawn step needs to set per-child model parameters.

Reviewer selection (`-co`) is a separate concern — it governs the Step 9 reviewer, not child agents. **No invocation flag sets a child model.** The per-topic annotation is the only input. See `references/arguments.md` for the canonical flag table.

## Resolution order

For each topic, the model is resolved in this strict order. The first rule that applies wins:

1. **Per-topic annotation** — use the topic's `**Model:**` marker extracted in Step 1a (from the `[Sub]` issue body — including Super-Epic child epics, which carry real `[Sub]` issues — or from the inline sub-task in a legacy inline-format epic).
2. **Default** — if a topic has no marker, default to `opus`.

Model values from annotations: `opus`, `sonnet`, `haiku`, `fable` (case-sensitive lowercase). `fable` = Claude Fable 5 (the Mythos-class tier above Opus); reserve it for the highest-value creative/design deliverables that `/big-plan` explicitly annotated.

## Marker format

Markers are written by `/big-plan`. Same parsing approach as the execution-mode marker.

**Standard shape** (each topic is its own `[Sub]` issue — including Super-Epic child epics from a `/big-plan -is` sweep) — body line, immediately after the `---` divider:

```
**Model:** opus — UI work, polished output benefits from the strongest child-model tier (opus)
```

or

```
**Model:** sonnet — mechanical schema migration, follow-the-pattern
```

or

```
**Model:** haiku — trivial config tweak
```

or

```
**Model:** fable — Fable 5; flagship creative design work (e.g. designing a theme lineup)
```

Grep with the same exact-spelling rule as the execution-mode marker:

```
gh issue view <sub-issue-number> | grep -E '^\*\*Model:\*\* '
```

**Legacy inline shape** (a Super-Epic child epic with no `[Sub]` issues — sub-tasks are inline bullets in the epic body) — sub-bullet under each entry, alongside the execution-mode sub-bullet:

```markdown
- **Header nav component** — adds the top nav with auth dropdown
  - **Execution mode:** subagents — independent
  - **Model:** opus — UI work, the strongest child-model tier (opus) wins on visual polish
- **Schema migration** — D1 migration for users table
  - **Execution mode:** subagents — independent
  - **Model:** sonnet — mechanical migration, no judgment needed
```

Treat any other value (`opus-pro`, `sonnet4`, `fable5`, blank reason, missing line) as **missing** — fall through to default `opus`. The fable spelling is exactly `fable` — `fable5` / `Fable 5` in the marker value are NOT recognized.

## Spawn-time application

When spawning each child (either Step 5 path), set the `model` parameter to that topic's resolved value individually. Children in the same session may run different models — that is the point.

**Teams path** (TeamCreate + Agent with team_name) — set `model: "<resolved-per-topic>"` on each Agent call.

**Subagents path** (Agent without team) — set `model: "<resolved-per-topic>"` on each Agent call.

There is no per-team model setting that applies to all teammates; the model is per-spawn.

Resolved values map directly to the Agent tool's `model` parameter — it accepts `opus` / `sonnet` / `haiku` / `fable`. A `**Model:** opus` marker spawns that child with `model: "opus"`; a `**Model:** fable` marker spawns it with `model: "fable"`.

## What to tell the user

Surface the resolution before spawning so the user can sanity-check it:

```
Models per topic:
  - topicA: opus (annotated: UI work, strongest child-model tier)
  - topicB: sonnet (annotated: mechanical refactor)
  - topicC: opus (default, no annotation)
```

This single block replaces any prior assumption that all children run on the same model.

## There is no session-wide override

Nothing on the invocation forces one model onto every child. The plan already decides the right tier per topic, and a blunt session-wide override would just discard that decision. Model choice belongs in the `/big-plan` annotation — edit it there.

See `references/arguments.md` for the canonical flag table.

## Defaults rationale

- **Default is `opus`** — preserves the pre-annotation behavior of `/x-wt-teams` (which was implicit-opus). New sessions without `/big-plan` annotations behave identically to before.
- **`/big-plan` annotates every sub-task explicitly** — its default annotation is `sonnet` (with `opus` for strongest-child-tier work), so this `opus` fallback mostly applies to topics created outside `/big-plan`.
- **Sonnet is opt-in for mechanical work** — the planner has to identify "this is follow-the-pattern" to mark it. Avoids accidental quality drops on judgment-heavy tasks.
- **Haiku is rare** — the planner has to identify a genuinely trivial task. Almost all real implementation work warrants Sonnet or above.

## Interaction with other features

- **Execution mode** (`subagents` vs `teams`) and **Model** are orthogonal. A `subagents`-path session can have one topic on opus and another on sonnet — different children, different models. A `teams`-path session can do the same — each TeamCreate+Agent spawn sets its own model.
- **Super-Epic** mode: same rules apply within each epic session. Different epics in the super-epic can choose different model mixes; they are separate `/x-wt-teams` invocations.
- **Manager session** is always Opus regardless of any marker. The markers govern child delegation only.
