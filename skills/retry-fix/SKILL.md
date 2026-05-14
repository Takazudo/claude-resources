---
name: retry-fix
description: "Investigate recurring bugs and regression cycles before attempting another fix. Use when: (1) User says 'still broken', 'X is blue again', 'this is the second/third/fourth time', 'we tried this before', 'I'm doing this many times', 'the regression is back', 'didn't stick', (2) A bug has been 'fixed' before but came back, (3) User mentions doing the same fix again, (4) Code changed for a feature but the previous fix got overwritten. ALWAYS use this skill before writing any code when a regression is detected — surface the prior-attempts table and get explicit confirmation before proceeding."
user-invocable: true
argument-hint: <problem-slug>
---

# Retry Fix

A recurring bug has been patched before and regressed. This skill excavates all prior attempts, diagnoses the structural pattern that lets it regress, and gates any new code change behind explicit user confirmation.

**Argument:** `$ARGUMENTS` — a problem slug (e.g. `active-frame-border`, `zoom-transform`, `modal-focus`).

## Step 1: Gather prior attempts

Run these searches in parallel. Use the slug and obvious keyword variants (kebab → spaces, camelCase, partial words):

```bash
# Git commits
git log --all --oneline -i --grep="<slug-keyword-1>"
git log --all --oneline -i --grep="<slug-keyword-2>"  # variant if needed

# Closed GitHub issues
gh issue list --state closed --search "<slug keywords>" --limit 30
```

For each result: record SHA (or issue number), date, and title. Deduplicate overlapping hits.

## Step 2: Read each prior attempt

For each unique commit SHA found:

```bash
git show <sha> --stat  # what files changed
git show <sha>         # full diff (skim for the structural change)
```

For each closed issue number: read the issue body (use `/gh-fetch-issue` if it has attached images). Capture:

- What the author thought was wrong
- What code changed
- What was NOT changed (the thing that caused the regression)

## Step 3: Check for existing lessons file

Look for a project-scoped lessons skill matching the slug:

```bash
ls .claude/skills/ | grep "l-lessons"
```

If `.claude/skills/l-lessons-<slug>/SKILL.md` exists:

- Read it fully
- Check the `last-updated:` frontmatter field
- If older than 90 days: surface a warning — "Lessons file may be out of date (last updated: YYYY-MM-DD). Verify context still applies."

## Step 4: Emit the structured report

Produce the following sections **in this exact order**. Do not skip sections. Do not merge sections.

---

### 1. Prior Attempts Table

| # | Date | Commit SHA | Issue | What it changed | What it missed |
|---|------|-----------|-------|-----------------|----------------|
| 1 | YYYY-MM-DD | `abc1234` | #N | One-line description | What was left untouched |
| 2 | … | … | … | … | … |

One row per distinct fix attempt. If a commit and an issue describe the same attempt, merge into one row.

### 2. Why Each Attempt Failed

One paragraph per attempt (numbered to match the table). Name the **specific assumption that was wrong** — not the symptom. Example: "Attempt 1 changed the JS default but not the CSS fallback, assuming CSS consumed the JS value at runtime. In fact the CSS fallback fires before JS runs, so the old palette index was visible until settings loaded."

### 3. Structural Diagnosis

Answer this question: **What is the architectural pattern that lets this bug regress?**

Concrete examples of structural diagnoses:

- "Multiple sources of truth for the same value; patches fix one site and miss others"
- "The fix lives in an ephemeral layer (JS runtime) that is overwritten by a persistent layer (CSS fallback) on each cold boot"
- "No test owns this invariant; regressions are invisible until a human notices visually"

One or two paragraphs. Specific over general.

### 4. Next-Step Checklist

Bulleted requirements the next attempt MUST include to prevent regression:

- [ ] Single source of truth — name the file:line that will own the value
- [ ] Guard test — describe the test (unit/e2e/visual) that will fail if the bug regresses
- [ ] Lint / static rule — if applicable, a grep pattern or ESLint rule that prevents the bad pattern
- [ ] Test matrix — list all states/paths that must be verified (e.g. "cold boot / settings change / theme switch / pop-out window")
- [ ] Migration — if persisted state can hold a stale value, describe how to clear or migrate it

Add or remove bullets as appropriate. Tailor to the actual structural diagnosis.

### 5. Retro-Notes Hand-Off

> Run `/retro-notes <slug>`
>
> Capture in `l-lessons-<slug>`: [one-sentence summary of what to record — the structural diagnosis above, the guard test requirement, and any traps from the checklist].

---

## Step 5: Refusal-to-start gate

After emitting the report, **do not propose or write any code**. Instead, ask:

> "I've surfaced all prior attempts above. Before I propose the next fix, please confirm: **'Yes, I've seen this and want a structurally different next attempt.'**"

Wait for explicit confirmation before proceeding. If the user confirms, default to invoking `/big-plan` (or describe the next attempt as a structured plan) — do not write code directly unless the user explicitly says so.

## Step 6: Updating the lessons file

When the user is ready to close out this session, or after the fix lands:

1. Run `/retro-notes <slug>` to append a dated section to `.claude/skills/l-lessons-<slug>/SKILL.md`.
2. Add or update the `last-updated: YYYY-MM-DD` frontmatter field in the lessons file (using today's date).
3. If no lessons file existed, `/retro-notes` will scaffold one — confirm the `last-updated` field is present after it runs.

## Notes

- **No code changes from this skill.** The skill investigates and gates. Actual implementation is delegated to `/big-plan` or a follow-up task.
- **Slug variants matter.** Try multiple keyword forms (e.g. `active-frame-border`, `active frame border`, `activeFrameBorder`, `frame border`) to avoid missing commits that used a different naming style.
- **Closed issues that reopened.** If a closed issue has `Reopened` events or a follow-up issue referencing it, include both in the table as separate rows.
- **Path safety.** Always use `$HOME` not `~` in file paths — `~` is not expanded by non-login shells or Node.js.
