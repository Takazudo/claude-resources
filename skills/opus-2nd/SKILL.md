---
name: opus-2nd
description: "Second opinion from Claude Opus on a plan or approach. Use when: (1) Planning phase of /big-plan needs a higher-quality review than /codex-2nd / /gco-2nd, (2) User says 'opus 2nd' or 'opus opinion', (3) Wanting Anthropic's larger model to critique a plan. Spawns a general-purpose Agent with model: opus that reads the plan file and returns structured feedback. Anthropic quota — not free."
argument-hint: <plan-file-path>
---

# Opus 2nd Opinion

Provide a second opinion on a development plan by spawning a general-purpose Agent with `model: opus`. Mirrors the Sonnet-subagent pattern already used by `/big-plan`'s Step 9 verification, just with Opus.

`$ARGUMENTS` is the absolute path to the plan markdown file (and optionally extra free-text context after the path).

## Process

### Step 1: Spawn the Opus subagent

Invoke the Agent tool with:

- `subagent_type`: `general-purpose`
- `model`: `opus`
- `description`: `Opus 2nd opinion on plan`
- `prompt`: the self-contained prompt template in Step 2 below, with `$ARGUMENTS` substituted into the plan path.

### Step 2: Prompt template

```
You are providing an independent Opus second opinion on a development plan.

The plan markdown file is at: <PLAN_FILE_PATH>
(If extra free-text context follows the path, treat it as supplementary input from the caller.)

Read the plan file. If it references source GitHub issues you need to understand intent, fetch them with `gh issue view <number>`.

Answer concretely:

1. Are there any risks, edge cases, or correctness traps in this approach?
2. Is the sub-task breakdown sound? Any sub-task too large, too coupled, or too vague to start without questions?
3. Are there missing sub-tasks or hidden dependencies the plan glossed over?
4. Is the dependency order correct? Can more sub-tasks run in parallel? Are the wave assignments sensible?
5. Are any items from the plan's "Original requirements checklist" missing from the sub-tasks?
6. Is there a simpler or materially better alternative worth flagging?

Be concise and practical. Focus on actionable feedback. If the plan looks solid, say so briefly — do not invent problems to look thorough.

Return a single markdown response with this shape:

## Opus review

### Verdict
<one-sentence overall judgment: solid / minor revisions / significant rework>

### Concrete suggestions
- <suggestion 1>
- ...

### Risks / edge cases
- <risk 1>
- ...

### Missing or under-specified
- <gap 1>
- ...

Omit any subsection with nothing to report rather than padding it with filler.

Read-only — do not edit any files. The caller decides what to incorporate.
```

When this skill is called from `/big-plan`'s Step 9 (verification), replace the review-questions block with the verification questions/report format specified in that step instead.

### Step 3: Return the feedback

The Agent's response IS the review. Hand it back to the caller verbatim or under a `### Opus review` / `### Opus verification` subsection of the caller's review log.

## Important Notes

- Opus uses Anthropic quota — more expensive than `/codex-2nd` / `/gco-2nd`. Justify the cost with concrete, actionable feedback
- Caller is responsible for consolidating Opus output with other reviewers when multiple flags were combined
- Read-only — the spawned Agent must never edit files
- NEVER use `~` in paths — use `$HOME`
