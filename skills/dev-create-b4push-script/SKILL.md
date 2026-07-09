---
name: dev-create-b4push-script
description: "Create a before-push validation script (b4push) and project-level b4push skill. Analyzes the project, identifies check steps (quality, build, test, doc site, e2e), generates scripts/run-b4push.sh, adds package.json entry, creates .claude/skills/b4push/SKILL.md. Use when: (1) User says 'create b4push', 'add b4push', 'before push script', (2) Setting up a new project's CI/validation workflow."
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Create B4Push Script

Generate a before-push validation script (`scripts/run-b4push.sh`), wire it into `package.json`, and create the project-level `.claude/skills/b4push/SKILL.md`.

**All templates and step tables live in the `/b4push-wisdom` skill — the single canonical source.** Read it before generating anything; do not keep a second copy of the templates here. This skill is the focused "just create the local script + skill" entry point; `/b4push-wisdom` is the full guide (local script + skill + CI workflow).

## Workflow

1. **Analyze the project** — package manager (lockfiles), available scripts (`check`, `build`, `test`, `lint`, `format`, `typecheck`), doc site (`doc/`, `docs/`, `website/`), e2e tests (playwright/cypress), data-generation scripts. See `/b4push-wisdom` Step 1.
2. **Determine steps** — pick the check steps that apply, using the step table in `/b4push-wisdom` Step 2.
3. **Create `scripts/run-b4push.sh`** — use the template in `/b4push-wisdom` Step 3, then `chmod +x scripts/run-b4push.sh`.
4. **Add the `package.json` script** — `"b4push": "./scripts/run-b4push.sh"` (`/b4push-wisdom` Step 4).
5. **Create `.claude/skills/b4push/SKILL.md`** — use the project-skill template in `/b4push-wisdom` Step 5. Uppercase `SKILL.md` is canonical; lowercase `skill.md` causes git dual-tracking / clone collisions on case-insensitive filesystems. Give it `user-invocable: true` and `allowed-tools: [Bash]`, with a description whose triggers fire on big changes, PR completion, etc.
6. **Test** — run `pnpm b4push` and fix any issues found.

For the optional GitHub Actions CI workflow and the reference-project list, see `/b4push-wisdom`.
