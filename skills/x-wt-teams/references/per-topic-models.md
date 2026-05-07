# Per-Topic Models — Resolution & Override

How `/x-wt-teams` decides which Claude model each child should run. Read when the spawn step needs to set per-child model parameters or when a `-haiku`/`-so`/`-op` flag is on the invocation.

## Resolution order

For each topic, the model is resolved in this strict order. The first rule that applies wins:

1. **Manual flag override** — if the invocation contains `-haiku` (or `--haiku`), `-so` (or `--sonnet`), or `-op` (or `--opus`), apply that model to **every** topic in the session. The flag is a deliberate session-wide override; per-topic `Model:` markers are ignored.
2. **Per-topic annotation** — otherwise, use the topic's `**Model:**` marker extracted in Step 1a (from the `[Sub]` issue body, or the inline sub-task in Super-Epic mode).
3. **Default** — if a topic has no marker AND no flag is present, default to `opus`.

Model values: `opus`, `sonnet`, `haiku` (case-sensitive lowercase).

## Marker format

Markers are written by `/big-plan`. Same parsing approach as the execution-mode marker.

**Non-Super-Epic mode** (each topic is its own `[Sub]` issue) — body line, immediately after the `---` divider:

```
**Model:** opus — UI work, polished output benefits from larger model
```

or

```
**Model:** sonnet — mechanical schema migration, follow-the-pattern
```

or

```
**Model:** haiku — trivial config tweak
```

Grep with the same exact-spelling rule as the execution-mode marker:

```
gh issue view <sub-issue-number> | grep -E '^\*\*Model:\*\* '
```

**Super-Epic child mode** (sub-tasks are inline bullets in the epic body) — sub-bullet under each entry, alongside the execution-mode sub-bullet:

```markdown
- **Header nav component** — adds the top nav with auth dropdown
  - **Execution mode:** subagents — independent
  - **Model:** opus — UI work, larger model wins on visual polish
- **Schema migration** — D1 migration for users table
  - **Execution mode:** subagents — independent
  - **Model:** sonnet — mechanical migration, no judgment needed
```

Treat any other value (`opus-pro`, `sonnet4`, blank reason, missing line) as **missing** — fall through to default `opus` (when no flag is also present).

## Spawn-time application

When spawning each child (either Step 5 path), set the `model` parameter to that topic's resolved value individually. Children in the same session may run different models — that is the point.

**Teams path** (TeamCreate + Agent with team_name) — set `model: "<resolved-per-topic>"` on each Agent call.

**Subagents path** (Agent without team) — set `model: "<resolved-per-topic>"` on each Agent call.

There is no per-team model setting that applies to all teammates; the model is per-spawn.

## What to tell the user

Surface the resolution before spawning so the user can sanity-check it:

```
Models per topic:
  - topicA: opus (annotated: UI work, larger model)
  - topicB: sonnet (annotated: mechanical refactor)
  - topicC: opus (default, no annotation)
```

Or, on flag override:

```
Manual override: all topics use sonnet (-so flag) — per-topic Model annotations ignored
```

This single block replaces any prior assumption that all children run on the same model.

## Why a flag is a session-wide override (not per-topic)

The flag is an instrument the user reaches for **at invocation time**, after seeing the plan. Reasons it overrides per-topic:

- The user already saw the plan before calling `/x-wt-teams`. If they pass `-so`, they've decided "for this run, force everything to sonnet" — possibly to save tokens, possibly to reproduce a previous run.
- Per-topic-respect-flag-only-when-default would create three states (no-flag-no-marker, no-flag-marker, flag) that interact in non-obvious ways. Override-everything is one clear state.
- If the user wants per-topic control, they edit the `/big-plan` annotation. The flag is the blunt instrument.

## Model-flag aliases

The same flag set already governs delegation elsewhere — see `references/arguments.md` for the canonical alias table and the manager-invariant rule (manager is always Opus regardless of flag).

In short: `-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`. At most one flag may be present. Multiple flags is an error — surface to the user.

## Defaults rationale

- **Default is `opus`** — preserves the pre-annotation behavior of `/x-wt-teams` (which was implicit-opus). New sessions without `/big-plan` annotations behave identically to before.
- **`/big-plan`'s default is also `opus`** — matches this default, so most topics will spawn on opus unless the planner explicitly downgraded.
- **Sonnet is opt-in for mechanical work** — the planner has to identify "this is follow-the-pattern" to mark it. Avoids accidental quality drops on judgment-heavy tasks.
- **Haiku is rare** — the planner has to identify a genuinely trivial task. Almost all real implementation work warrants Sonnet or above.

## Interaction with other features

- **Execution mode** (`subagents` vs `teams`) and **Model** are orthogonal. A `subagents`-path session can have one topic on opus and another on sonnet — different children, different models. A `teams`-path session can do the same — each TeamCreate+Agent spawn sets its own model.
- **Super-Epic** mode: same rules apply within each epic session. Different epics in the super-epic can choose different model mixes; they are separate `/x-wt-teams` invocations.
- **Manager session** is always Opus regardless of any flag or marker. The flag and markers govern child delegation only.
