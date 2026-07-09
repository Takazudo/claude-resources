---
name: finalize-codex-work
description: "Acceptance gate for a branch produced by an OpenAI Codex CLI run — usually Codex implementing a /big-plan epic that was handed off to it. Codex reports the work 'done' (or the user flags it WIP with corrections); this skill confirms the branch actually fulfils the original spec, fixes what falls short, and routes larger discoveries into GitHub issues. Use when: (1) User says '/finalize-codex-work', 'finalize codex work', 'confirm the codex work', 'check the codex branch', or 'codex said it's done', (2) A branch is the result of a Codex CLI session and needs verification against its spec issue/PR, (3) After assigning a /big-plan epic to Codex CLI. Pass -m/--merge to run /pr-complete -c at the end."
argument-hint: "[-m|--merge]"
---

# Finalize Codex Work

The current branch is the output of an OpenAI Codex CLI run — usually Codex implementing a `/big-plan` epic that was handed to it. Codex reports the work is **done** (or the user flags it as WIP and gives corrections). This skill is the **acceptance gate**: confirm the branch actually fulfils the original spec, fix what falls short, and route larger discoveries into the standard issue flow.

You are reviewing another agent's work — the "it's done" claim earns nothing on its own. Verify against the spec, run the checks, read the diff.

## Options

- `-m` / `--merge` — after verification passes, finish by running `/pr-complete -c` (merge the PR and close its linked issue). Without it, leave the PR for the user and just report readiness.

## Step 1 — Establish the spec and the work

Find out **what was asked** and **what was delivered**.

- `git status`, `git log --oneline -20`, and identify the base branch this branch forks from. For a `/big-plan` epic the branch is usually `base/<slug>`.
- Find the PR: `gh pr view --json number,title,body,url,baseRefName,headRefName`. The PR body normally links the **epic issue** (and sometimes sub-issues) — that is the spec.
- Read every referenced issue with `/gh-fetch-issue` (it downloads attached images and fences untrusted comment text — `gh issue view` alone misses images). The `[Epic]` body holds the overview + acceptance criteria; each `[Sub]` issue is one unit of work.
- If the user gave WIP instructions instead of "done", treat those as the authoritative task list — layered on top of the spec, not replacing its acceptance criteria.

If there is no PR and no linked issue, ask the user for the spec rather than guessing what "done" means.

## Step 2 — Map requirements → implementation

Turn the spec into a concrete checklist and check each item against the code.

- Build an acceptance checklist from the epic/sub-issue acceptance criteria (plus any WIP instructions).
- Read the branch diff against its base: `git diff <base>...HEAD` (three-dot, so you see only this branch's changes). Use `--stat` first to scope, then read the substantive files.
- For each checklist item, confirm it is **actually implemented** — not just claimed in a commit message. Codex sometimes reports a step done while leaving a TODO, a stub, or a half-wired integration.
- Watch for integration points the spec implies but the diff might skip. A project's feature checklist is a common source of "implemented but not wired" gaps — e.g. this repo's `CLAUDE.md` requires a command-palette entry + keyboard shortcut + settings wiring for a new UI feature.

## Step 3 — Verify it actually works

A green self-report is not verification. Run the project's own gate.

- Run the repo's pre-push / test lane — check `CLAUDE.md` for the command (in this repo: `pnpm b4push`, plus `pnpm exam` when the change touches a module in `e2e/README.md`'s mapping table).
- For UI / CSS / layout changes, tests don't prove visual correctness — verify real behavior (`/verify-ui`, `/headless-browser`) per the repo's testing guidance.
- Report failures honestly, with the output. If a check fails, the work is not done — fix it (Step 4) before finalizing.

## Step 4 — Close the gaps

Route each gap by size:

- **Small, obvious, in-scope fix** (missed wiring, a stub to fill, a failing assertion) → fix it inline on this branch and commit. This is the common case for "Codex was 95% there".
- **Multiple distinct topics, or newly-discovered bugs unrelated to the original spec** → run the `/x-wt-teams` completion flow:
  1. **Raise an issue** for each topic / discovery.
  2. **Attempt to handle it** — if tractable now, fix it (directly, or fan out via `/x-wt-teams` for genuinely parallel multi-topic work).
  3. **If it can't be resolved here** — leave it as a GitHub issue labelled **`agent-found`** (the established label for agent-discovered, needs-human-decision findings) so it is tracked, not lost. The label-create snippet + issue template live in `$HOME/.claude/skills/x-wt-teams/references/issue-templates.md`.

The dividing line: a gap in *delivering the original spec* gets fixed here; a *new discovery* becomes a tracked issue.

## Step 5 — Finalize

- Summarize: what the spec asked, what was delivered, what you fixed, what you raised as issues, and the verification result.
- **If `-m` / `--merge`**: run `/pr-complete -c` to merge the PR and close its linked issue.
