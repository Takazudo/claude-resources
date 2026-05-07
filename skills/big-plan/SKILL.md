---
name: big-plan
description: "Plan implementation by breaking work into one epic GitHub issue + child sub-issues. Use when: (1) User says '/big-plan', (2) User wants to plan an implementation before coding, (3) User wants to split a feature into small issues for parallel agent team work, (4) User references existing issues (e.g. 'implement issue #123', 'plan all open issues', 'plan recent 3 open issues'). Auto-reads project-scope l-lessons-* skills (from /retro-notes) before planning. Supports -co/-gco/-gcoc flags for second opinions and post-creation verification (runnable in parallel). Large scope is kept in ONE epic and sequenced into dependency waves run via /x-wt-teams --stay. Planning only — no code changes."
argument-hint: <description-or-issue-refs> [-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-nor|--no-review]
---

# Big Plan

Planning-only skill. Explore the codebase, propose a breakdown, save a plan log to `$HOME/cclogs/{slug}/`, optionally get a second opinion (via Codex or GitHub Copilot), create GitHub issues, verify nothing was lost, and hand off to `/x-wt-teams` in a fresh session.

This skill is useful for **almost every implementation task**, not just huge ones. It captures intent, breaks work into reviewable units, and creates a paper trail that survives context compression.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Express the user's intent for the **planning session itself** — a paper trail of "I wanted to plan this with opus/sonnet/haiku." `/big-plan` cannot switch its own session's model, so the flag is recorded in the plan log and the epic body but otherwise informational. **NOT forwarded to the `/x-wt-teams` hand-off** (Step 11). Implementation-session model decisions live per sub-task in the created issue bodies (see Step 3 — _Pick the model per sub-task_); `/x-wt-teams` reads those annotations. If the user wants a session-wide model override on the implementation session, they add `-haiku`/`-so`/`-op` to `/x-wt-teams` manually at invocation time. Pick at most one.
- **`-co` or `--codex` flag**: If present, get a Codex second opinion on the saved plan (Step 5) and use Codex as the verification reviewer (Step 9). Applies to the **planning session only** — **NOT forwarded** to the `/x-wt-teams` hand-off. Reviewer flags for the implementation session are the user's choice; they add `-co` to `/x-wt-teams` themselves at invocation time when they want one. Can be combined with `-gco` or `-gcoc` to run multiple reviewers in parallel.
- **`-gco` or `--github-copilot` flag**: If present, use GitHub Copilot CLI for the Step 5 second opinion, the Step 9 verification reviewer, and any research during exploration (Step 2). See "GitHub Copilot Mode" section. Applies to the **planning session only** — **NOT forwarded** to the `/x-wt-teams` hand-off. Can be combined with `-co`. **Mutually exclusive with `-gcoc`** (same tool, different model — pick one).
- **`-gcoc` or `--github-copilot-cheap` flag**: Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). See "GitHub Copilot Cheap Mode" section. Applies to the **planning session only** — **NOT forwarded** to the `/x-wt-teams` hand-off. Can be combined with `-co`. **Mutually exclusive with `-gco`** (same tool, different model — pick one).
- **Multiple reviewer flags** — when `-co` is combined with `-gco` (or `-gcoc`), every specified reviewer is invoked in parallel during Step 5 and their feedback is consolidated into a single `## Review Notes` section before user confirmation.
- **`-nor` or `--no-review` flag**: If present, run the planning end-to-end with no confirmation gates and no review steps. Skips Step 5 (second opinion), Step 6 (propose-to-user wait), and Step 9 (requirements verification). The plan is drafted, the log is saved, the issues are created, and the session ends. Use when you've already decided what to plan and just want the issues created. Mutually compatible with `-co` / `-gco` / `-gcoc` — but those reviewer flags become no-ops when `-nor` is also present (no review runs).
- **Existing issue references** — any of these trigger _existing-issue mode_ (see Step 1b):
  - A GitHub issue URL: `https://github.com/owner/repo/issues/123`
  - An issue number: `#123` or bare `123`
  - Phrases like "all open issues", "implement all issues"
  - Phrases like "recent N open issues" or "latest N issues"
- **Everything else**: free-text description of what to implement.

You can also receive a mix (e.g. "plan #45 and #47 with some auth cleanup on top"). Treat the issue refs as source material AND incorporate the extra free-text context.

## Branch Context (detect first, do NOT skip)

Before running any workflow step, capture the **current branch** — this is the **parent branch** the new implementation base branch will be created from and the branch its eventual PR will target.

```bash
PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Parent branch: $PARENT_BRANCH"
```

**Why this matters — read carefully:**

`/big-plan` is typically invoked **on the branch the new feature will land on**. The default assumption is NOT "PR into `main`" — it is "PR into whatever branch I'm on right now."

- If `$PARENT_BRANCH` is `main` (the common case) → new `base/{impl-title-slug}` is branched from `main` and its PR targets `main`. Behave as before.
- If `$PARENT_BRANCH` is anything else (e.g. `base/foo-impl`, `feature/x`, `develop`) → new `base/{impl-title-slug}` is branched from `$PARENT_BRANCH` and its PR targets `$PARENT_BRANCH`. This is the **nested-base** pattern (e.g. `base/new-impl` → `base/foo-impl` → `main`). It is intentional and common — do **NOT** silently swap in `main`.

**Use `$PARENT_BRANCH` everywhere this skill previously hardcoded `main`:**

- Step 7 epic body — "merges into `$PARENT_BRANCH` as one PR" (not "merges into main")
- Step 8 sub-issue bodies — `Base branch: base/{impl-title-slug}` ... "(which itself targets `$PARENT_BRANCH`)"
- All hand-off messages mentioning the eventual merge target

**Surface the parent branch to the user in Step 6 (proposal)** so they can correct it if they accidentally invoked from the wrong branch. If `$PARENT_BRANCH` is not `main`, call it out explicitly as a confirmation gate — this is the case the user has historically had to fight.

## Workflow

### 1a. Understand the task (free-text mode)

If the user gave a free-text description, read it. If vague, ask one clarifying question before exploring.

### 1b. Fetch existing issues (existing-issue mode)

If the input references existing issues, fetch their full content (including embedded images) before planning. **Always use `gh-fetch-issue`** — `gh issue view` cannot read issue-embedded images.

**Single issue by URL or number:**

```bash
bash $HOME/.claude/skills/gh-fetch-issue/scripts/fetch-issue.sh <url-or-number>
```

**"All open issues":**

```bash
gh issue list --state open --json number,title,url --limit 50
```

Then fetch each returned issue via the `gh-fetch-issue` script above.

**"Recent N open issues":**

```bash
gh issue list --state open --json number,title,url,createdAt --limit N
```

Then fetch each via the `gh-fetch-issue` script.

Read every fetched `issue.md` file and any images in `assets/`. Understand the requirements fully before proceeding.

**Track the source issue numbers/URLs and their local `issue.md` paths** — you'll need them for verification (Step 9) and closing (Step 10).

### 1c. Read project lessons

Project-scope lessons skills (`l-lessons-*`) capture root-cause notes from previous attempts in the same area, written by `/retro-notes`. Read any that apply before planning so prior pain becomes permanent leverage.

```bash
ls .claude/skills/l-lessons-*/SKILL.md 2>/dev/null
```

For each `l-lessons-{area}` skill found, check whether `{area}` matches the topic being planned by reading its frontmatter `description`. For every relevant one, read its full `SKILL.md` content.

If you find one or more relevant lessons files, surface them to the user explicitly:

> Found {N} project lessons file(s) relevant to this area: `{l-lessons-foo}`, `{l-lessons-bar}`. Reading them before planning.

Use the lessons — especially the **Watch for next time** and **Would-skip-if-redoing** sections — to inform the plan in Step 3:

- When a sub-task is shaped by a past lesson, call it out under that sub-task in the plan log: `> Shaped by lesson: {trap or skip-if-redoing summary}`.
- If a previous attempt's "Would-skip-if-redoing" advice contradicts a sub-task you'd otherwise add, drop or simplify the sub-task.
- If a "Watch for next time" trap suggests a structural choice (e.g. "invert the transform at the input boundary"), bake that choice into the relevant sub-task's description rather than leaving it for the implementer to discover again.

If no `l-lessons-*` skills exist or none match the topic, skip silently and proceed to Step 2. This is enrichment, not a blocking step — never fail planning because lessons aren't there.

### 2. Explore the codebase

Do a thorough exploration of all relevant code. Read existing patterns, understand the architecture, identify what files will need to change and what new ones will be created. Be comprehensive — this is the expensive step that justifies a dedicated session.

### 3. Draft the plan

Break the implementation into sub-tasks that are:

- **Small** — completable in a single focused agent session (ideally under 20 tool calls)
- **Independent** — ideally parallelizable, or with clear sequential dependencies
- **Concrete** — scope is specific enough that an agent can start without asking questions

Identify the dependency order (which must come first, which can run in parallel).

#### Classify execution mode per sub-task

For every sub-task, also pick how the downstream `/x-wt-teams` session should spawn its child:

- **`subagents`** — sub-task is independent of its siblings. The child runs once, does its work, optionally self-reviews via `/light-review`, and reports back. No mid-flight communication with other children. **This is the right answer for most sub-tasks.**
- **`teams`** — the child genuinely needs mid-flight coordination: depends on another sibling's output produced during the same session, peers another child for partial state, or expects to be re-engaged later with prior memory.

Default to **`subagents`** when in doubt. The criterion is "does this child need to talk to another child mid-task?" — not "is this child doing heavy work?" Heavy work is fine in a subagent.

Record the choice and a one-line reason per sub-task. Both the plan log (Step 4) and the created sub-issue bodies (Step 8) carry this annotation so `/x-wt-teams` can route accordingly.

#### Pick the model per sub-task

Independently of execution mode, classify which Claude model the downstream child should use.

**Guiding principle:** `/big-plan` already captured the hard decisions — architecture, dependencies, trade-offs, acceptance criteria. Each sub-task is "follow this spec to land this change." For most sub-tasks, that's mechanical implementation work, and **Sonnet handles it correctly, faster, and cheaper**. Opus is reserved for sub-tasks whose deliverable specifically benefits from larger-model creative quality.

- **`sonnet`** (default) — pick for the bulk of implementation work: well-defined refactors, schema/migration changes, route plumbing, hook wiring, dispatcher logic, capability detection, lifecycle integration, test scaffolding, build/CI config, dep bumps, mechanical CLI flags, English technical documentation, follow-the-pattern code. Anything where the spec from `/big-plan` makes the answer clear and the agent is mostly executing.
- **`opus`** — pick only when the sub-task's quality bar genuinely benefits from a larger model:
  - **High-quality Japanese-language writing** — translation, native-feel prose, nuanced tone (esa / zpaper / CodeGrid articles, Japanese UI copy, marketing copy where reading like a native speaker matters).
  - **Creative UI work** — original visual design, polished interaction design, layout judgment for a new surface, novel component look-and-feel. Generic "add a button to an existing surface" UI work is sonnet — opus is for when visual taste actually moves the result.
  - **Pattern generation / visual-creative algorithms** — GLSL fragment shaders, generative art, noise/warp/distortion code, anything where "this looks right" depends on aesthetic judgment (e.g., the pgen app's pattern generators).
  - **Genuinely difficult problem-solving** — subtle correctness questions, intricate algorithm work, complex async / state-machine logic, race-condition-prone code, novel architectural decisions that `/big-plan` couldn't fully spec out. If the sub-task needs real reasoning *beyond* "follow this spec," lean Opus. Rare when `/big-plan` did its job thoroughly, but **err on the side of Opus when difficulty is hard to judge** — paying for one Opus run is cheaper than re-doing a Sonnet run that got the subtle case wrong.
- **`haiku`** — only for genuinely trivial work: a typo fix, a one-line config tweak, an obvious mechanical edit. Cautious by default — Haiku is a real downgrade on anything ambiguous.

Default to **`sonnet`** when in doubt. Pick `opus` only when there's a clear creative-quality reason from the list above. `haiku` is rare.

**Concrete examples:**

| Sub-task type                                       | Model  | Why                                           |
| --------------------------------------------------- | ------ | --------------------------------------------- |
| Adding a new GLSL fragment-shader pattern           | opus   | Visual-creative; pattern-generation aesthetic |
| Adding a new pgen Canvas2D pattern algorithm        | opus   | Same — visual-creative aesthetic judgment     |
| Writing a Japanese esa/zpaper/CodeGrid article      | opus   | High-quality Japanese writing                 |
| Designing a new UI surface from scratch             | opus   | Creative UI judgment                          |
| Implementing a dispatcher per a planned spec        | sonnet | Mechanical wiring; spec is in the plan        |
| Schema migration                                    | sonnet | Mechanical                                    |
| Adding a CLI flag with documented behavior          | sonnet | Mechanical                                    |
| Writing tests for a defined contract                | sonnet | Mechanical                                    |
| English technical documentation page                | sonnet | Mechanical writing                            |
| Plumbing a hook/lifecycle wiring                    | sonnet | Mechanical                                    |
| Subtle async / race-prone correctness work          | opus   | Genuinely difficult — err Opus when in doubt  |
| One-line config bump                                | haiku  | Trivial                                       |

`/x-wt-teams` reads this annotation per topic and spawns each child with the matching model. A manual `-haiku` / `-so` / `-op` flag on the `/x-wt-teams` invocation **overrides every topic's annotation** session-wide (manual override). Without a flag, per-topic annotations are honored — different topics in the same session can run different models.

Record the choice and a one-line reason per sub-task. The annotation goes next to the execution-mode line in both the plan log (Step 4) and the created sub-issue bodies (Step 8).

### 3.5. Sequence sub-tasks into waves and insert confirm sub-issues at risky boundaries

**Always one epic — never split into multiple epics.** Even when scope is large, the answer is more sub-issues sequenced into dependency waves under the same epic. Manager-context savings from splitting epics are not real in practice; managing one chained epic is simpler than juggling multiple sessions, and `/x-wt-teams` already supports running sub-issues in waves via `-s` / `--stay`.

**Group sub-tasks into waves.** A wave is a set of sub-tasks that can run concurrently in one `/x-wt-teams` session. Waves run sequentially — wave N+1 starts only after every sub-task in wave N is merged into the epic base.

- **Wave size ≤ 6** — `/x-wt-teams` caps concurrent child agents at 6 to avoid freezing the local machine. If a wave would exceed 6, split it into wave Na and wave Nb (still within the same dependency tier — order between Na and Nb is arbitrary, just not concurrent).
- **A single huge plan stays one epic** — if you have 18 truly parallelizable sub-tasks, that's three waves of 6, not three epics. The user runs three sequential `--stay` sessions on the same epic base.
- **A typical multi-phase plan is also one epic** — e.g., `wave 1: backend (4 sub-tasks)` → `wave 2: backend confirm (1 sub-task)` → `wave 3: frontend (3 sub-tasks)`. Three sessions, one epic, one PR.

**Insert "confirm" sub-issues at risky cross-phase boundaries.** When a downstream wave depends on the previous wave's deliverable working correctly (not just landing), add a dedicated confirm sub-issue between them. The confirm sub-issue is a small, focused validation pass — its acceptance criteria are "exercise the upstream surface, run the integration check, fix anything broken." Treat it like any other sub-task: it has its own execution mode, model, and one-line reason.

Reach for a confirm sub-issue when:

- Wave N+1 calls into Wave N's API/contract and a regression there would silently break N+1 (e.g., backend returns the wrong shape and frontend ships looking fine because it never throws).
- Wave N+1's correctness depends on a behavior that's hard to assert from inside an individual Wave N sub-task (cross-cutting integration, end-to-end smoke test, schema-level invariant).
- Multiple Wave N sub-tasks land independently and their interaction needs a sanity check before Wave N+1 commits.

A confirm sub-issue is normally `subagents` mode + `sonnet` model — its job is to validate, not invent. Acceptance criteria should name the exact checks to run.

**Per sub-task, record its wave number** in the plan log (Step 4) and the sub-issue body (Step 8) so the user knows which sub-issues to claim per `/x-wt-teams --stay` session. Format: `**Wave:** {N}` on its own line, alongside the `Execution mode:` and `Model:` markers.

**Dependency notes still belong on each sub-task** — call out specific upstream sub-issues (`Depends on: #N1, #N2`) separately from the wave number, so the user can verify the wave grouping before kicking off each session.

### 4. Save plan log to cclogs

Save the draft plan before anything else. This is the source of truth for review, second opinions, verification, and later reference.

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
# SLUG is the kebab-case impl-title (see Naming Conventions)
PLAN_FILE="$LOGDIR/${DATETIME}-big-plan-${SLUG}.md"
```

Write the plan to `$PLAN_FILE` as a markdown document containing:

- `# Big Plan: {Impl Title}`
- **Source** — either the free-text description verbatim, or the list of source issues (number, title, URL, and brief summary of each)
- **Overview** — what's being built and why
- **Base branch** — `base/{impl-title-slug}`
- **Epic issue title** (proposed)
- **Wave order** — list every wave with its sub-tasks (e.g. `Wave 1: backend (4 sub-tasks)`, `Wave 2: backend confirm (1 sub-task)`, `Wave 3: frontend (3 sub-tasks)`). Used by the user to plan their `--stay` sessions.
- **Sub-tasks** — for each:
  - Proposed sub-issue title
  - Description
  - Files to touch / create
  - Acceptance criteria
  - **Wave**: `1`, `2`, ... — which wave this sub-task belongs to (see Step 3.5)
  - Dependencies on other sub-tasks (specific `#N` references, separate from wave grouping)
  - **Execution mode**: `subagents` or `teams` — with one-line reason (see Step 3 for criterion)
  - **Model**: `opus`, `sonnet`, or `haiku` — with one-line reason (see Step 3 for criterion)
- **Architectural decisions / rationale**
- **Original requirements checklist** — bullet list of every concrete requirement from the source (free-text or source issues). Used in Step 9 for verification.

Report the path to the user: `Plan saved: $PLAN_FILE`.

### 5. (Optional) Second opinion — `-co` / `--codex`, `-gco` / `--github-copilot`, or `-gcoc` / `--github-copilot-cheap`

**Skip this step entirely if `-nor` / `--no-review` was passed**, even if one of the reviewer flags is also present. No `## Review Notes` section is added to `$PLAN_FILE`. Proceed directly to Step 6.

Only if one or more of `-co`/`--codex`, `-gco`/`--github-copilot`, or `-gcoc`/`--github-copilot-cheap` was in `$ARGUMENTS`. Multiple flags may be specified — `-co` combines with `-gco` or `-gcoc` (but `-gco` and `-gcoc` are mutually exclusive since they are the same tool with different models).

The review questions are the same regardless of tool:

1. Is the breakdown sound? Any sub-tasks too large or too coupled?
2. Are there missing sub-tasks or hidden dependencies?
3. Are there risks or edge cases not covered?
4. Is the dependency order correct? Can more run in parallel?
5. Are any original requirements from the source missing from the plan?

**Run every specified reviewer in parallel.** Determine which flags are active, then invoke the corresponding sub-skills concurrently (single assistant turn, multiple tool calls). Each reviewer reads the same `$PLAN_FILE` and answers the same questions above — they don't need to coordinate.

> **Skill names are top-level, not plugin-namespaced.** Invoke via `Skill(skill="codex-2nd")`, `Skill(skill="gco-2nd")`, `Skill(skill="gcoc-2nd")`. Do **NOT** use `codex:codex-2nd` — that namespace belongs to the openai-codex plugin and does not contain these skills.

**Per-flag invocation:**

- **`-co` / `--codex` — `/codex-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/codex-2nd/SKILL.md`. Pass the contents of `$PLAN_FILE` as context.
- **`-gco` / `--github-copilot` — `/gco-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/gco-2nd/SKILL.md`. Pass `$PLAN_FILE` as context. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the subagent fallback for that reviewer.
- **`-gcoc` / `--github-copilot-cheap` — `/gcoc-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/gcoc-2nd/SKILL.md`. Pass `$PLAN_FILE` as context. If Copilot is rate-limited, `/gcoc-2nd` silently skips — fall through to the subagent fallback for that reviewer.

**Consolidate feedback from all reviewers.** When multiple reviewers were invoked:

- Collect each reviewer's output.
- Under `## Review Notes` in `$PLAN_FILE`, add one subsection per reviewer (e.g. `### Codex review`, `### GitHub Copilot review`). Record the raw feedback verbatim or as a faithful summary.
- If reviewers disagree, note the disagreement and use your own judgment — you don't have to accept every suggestion. Prefer changes that multiple reviewers flag, or that are clearly correct.
- If a reviewer was skipped (rate limit / timeout), note that under its subsection and — if the skip leaves you with zero external reviews — run the subagent fallback below to avoid proceeding with no second opinion at all.

**Fallback: subagent review (when a reviewer is rate-limited or unavailable)**

If a specific reviewer's pre-flight rate-limit check fails or it times out, fall back to a Plan subagent via the Agent tool **for that reviewer only** (the other reviewers still run as normal). Prompt the agent with the same review questions and point it at `$PLAN_FILE`:

```
Review the big-plan document at {PLAN_FILE}. Focus on:
1. Is each sub-task small enough for a single focused agent session (≤20 tool calls)?
2. Are dependencies correct? Can anything run more in parallel?
3. Are there missing sub-tasks, hidden coupling, or risks?
4. Are acceptance criteria concrete enough for an agent to implement without asking questions?
5. Does the plan cover every item in the "Original requirements checklist" section?

Return a concise list of concrete suggestions. If the plan is solid, say so.
```

**Incorporate useful feedback** by updating `$PLAN_FILE` in place (Edit tool) before proceeding. The `## Review Notes` section should leave a paper trail of what each reviewer said and which suggestions were applied.

### 6. Propose to user before creating issues

Present the (optionally refined) plan to the user:

- Plan log path: `$PLAN_FILE`
- Proposed `impl-title`
- **Parent branch (detected current branch): `$PARENT_BRANCH`** — the new base branch will be created from this and the eventual PR will target this. If this is **not** `main`, explicitly call it out: "We are on `$PARENT_BRANCH`, so the new `base/{impl-title-slug}` will branch off `$PARENT_BRANCH` and PR into it (nested base). Confirm this is what you want — if you meant `main`, switch branches and re-run." Do not assume `main`.
- Suggested base branch: `base/{impl-title-slug}` (parent: `$PARENT_BRANCH`)
- List of sub-tasks with dependency notes
- Source issues (if existing-issue mode)
- Review notes (if any of `-co` / `-gco` / `-gcoc` was used — may contain multiple reviewer subsections when flags were combined)

Ask: "Does this look right? Should I adjust anything before creating the issues?"

**Wait for confirmation before proceeding.** If the user requests changes, update `$PLAN_FILE` and re-confirm.

**`-nor` / `--no-review` override:** Skip the question and the wait. Print the same proposal as a one-shot summary so the user can see what's about to be created, then proceed straight to Step 7. The user opted in to no-confirmation mode by passing the flag.

### 7. Create the epic issue

Create the epic first to get its URL.

**Before the first `gh issue create` of this session**, ensure the tier labels exist on the repo — see [Issue Labels](#issue-labels) and run the bootstrap block once.

Pass `--label epic` to the `gh issue create` call.

**Title format:** `[{Impl Title}][Epic] {Feature name}`

Example: `[Team Feature][Epic] Team management and workspace sharing`

**Body must include:**

- One-line description: "This is an epic tracking issue for the **{Impl Title}** implementation."
- Overview of what's being built
- Source issues section (if existing-issue mode): "Supersedes: #A, #B, #C"
- Base branch: `base/{impl-title-slug}` — all sub-issue PRs target this branch
- **Parent branch:** `$PARENT_BRANCH` (the branch this base will eventually PR into — substitute the actual branch name, e.g. `main` or `base/foo-impl`)
- Note: "Implementation will be done via `/x-wt-teams` — child branches merge into the base branch, which then merges into `$PARENT_BRANCH` as one PR" (substitute the actual parent branch name)
- **Wave plan** — list each wave with the sub-issues it contains. Tells the user how many sequential `/x-wt-teams --stay` sessions to run and what to expect from each. Example: `Wave 1 (parallel): #N1, #N2, #N3, #N4` / `Wave 2 (confirm): #N5` / `Wave 3 (parallel): #N6, #N7, #N8`.
- **Sub-issues table** listing all child issues (fill in URLs in Step 9 — or note "see comments below")
- "Close each sub-issue as its implementation is merged."

### 8. Create child issues

Create each sub-issue with `gh issue create --label sub`.

**Title format:** `[{Impl Title}][Sub] {Task name}`

Example: `[Team Feature][Sub] D1 schema migration`

**Body must start with:**

```
- {epic-issue-url}

---

**Wave:** {N}
**Execution mode:** {subagents|teams} — {one-line reason from Step 3}
**Model:** {opus|sonnet|haiku} — {one-line reason from Step 3}
```

The `Execution mode:` and `Model:` marker lines are **mandatory** and exact-spelling matters — `/x-wt-teams` greps the body for `Execution mode:` to choose the spawn path and for `Model:` to pick each topic's model. The `Wave:` line is informational for the user (it tells them which `--stay` session this sub-issue belongs to); `/x-wt-teams` does not parse it. Place all three lines immediately after the `---` divider, on their own lines, in the order shown.

Then the rest of the body: what needs to be done, which files to touch, what the acceptance criteria are. Be specific enough that an agent can implement it without this planning session's context.

Include at the bottom:

```
**Base branch:** `base/{impl-title-slug}` — PR targets this branch (which itself targets `$PARENT_BRANCH`, e.g. `main` or `base/foo-impl` — substitute the actual parent name).
```

Then update the epic issue body to include the full list of sub-issue URLs (`gh issue edit {epic-number} --body "$(cat <<'EOF' ... EOF)"`).

### 9. Verify original requirements are preserved

**Skip this step entirely if `-nor` / `--no-review` was passed.** Do not spawn the verification reviewer, do not write a `## Verification Report` to `$PLAN_FILE`, do not block before Step 10. Proceed directly to Step 10. The user opted out of verification by passing the flag.

**This step is critical.** We've had cases where the original requirements were lost when rearranged into epic + sub-issues. One or more verification reviewers cross-check the created issues against the original source.

**Pick the verification reviewer(s) based on flags** (the same flags that drive Step 5):

- **No external reviewer flag** (default) → spawn a `general-purpose` agent with `model: sonnet` via the Agent tool.
- **`-co` / `--codex`** → use `/codex-2nd` for verification.
- **`-gco` / `--github-copilot`** → use `/gco-2nd` for verification.
- **`-gcoc` / `--github-copilot-cheap`** → use `/gcoc-2nd` for verification.
- **Multiple flags combined** → run every specified external reviewer **in parallel** (single assistant turn, multiple tool calls) and consolidate their findings into a single `## Verification Report`. When reviewers disagree, prefer findings flagged by multiple reviewers; use your own judgment for one-off claims.
- **Fallback** — if a flagged external reviewer's pre-flight rate-limit check fails or it times out, fall back to the Sonnet subagent **for that reviewer only** (other reviewers still run as usual). If all flagged reviewers skip and there is no Sonnet result either, run the Sonnet subagent once so verification still happens — never proceed to Step 10 with zero verification.
- The Sonnet subagent is also acceptable as an additional reviewer alongside flagged ones if you want extra coverage, but it is **not required** when at least one external reviewer succeeds.

The verification task is the **same regardless of which tool runs it**:

1. Read the original source:
- Free-text mode: the user's original description (paste it into the prompt, plus `$PLAN_FILE`)
- Existing-issue mode: each source `issue.md` path from Step 1b
2. Read each created issue via `gh issue view {number}` — the epic AND every sub-issue (pass the issue numbers in the prompt)
3. Compare and identify:
- **Missing requirements** — items present in the source but not covered by any issue
- **Misinterpreted requirements** — items in an issue that don't match the source intent
- **Ambiguous coverage** — items partially addressed but not concrete enough
4. Return a structured report:

```
## Verification Report

### Missing from issues
- [source ref] <what's missing>
- ...

### Misinterpreted
- [issue #N] <what's wrong>
- ...

### Ambiguous
- [issue #N] <what needs clarification>
- ...

### All clear
<list of source items that were correctly covered — can be brief>
```

**Sonnet subagent invocation (default / fallback)** — example Agent tool call shape (written out for clarity, not a literal JSON):

- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- `description`: `Verify issues preserve source requirements`
- `prompt`: self-contained prompt with the source, issue numbers, and the report format above

**External reviewer invocation (when `-co` / `-gco` / `-gcoc` is passed):**

For each active flag, follow the invocation pattern in the corresponding skill's SKILL.md (`$HOME/.claude/skills/codex-2nd/SKILL.md`, `$HOME/.claude/skills/gco-2nd/SKILL.md`, `$HOME/.claude/skills/gcoc-2nd/SKILL.md`). These are top-level skills — invoke via `Skill(skill="codex-2nd")` / `Skill(skill="gco-2nd")` / `Skill(skill="gcoc-2nd")`, never `codex:codex-2nd`. Replace each tool's default "review the plan" prompt with the verification prompt structured as above. The prompt MUST include:

- The original source (paste the free-text description verbatim, or list every source `issue.md` path)
- The full list of created issue numbers (epic + every sub-issue) and a note that the reviewer can run `gh issue view {number}` to inspect each issue body
- The exact report format above so output is consistent across reviewers

**Handling the report:**

- If **all clear** with no issues, report the verification result to the user and proceed to Step 10.
- If anything is missing/misinterpreted/ambiguous, **fix the issues directly** using `gh issue edit {number} --body "$(cat <<'EOF' ... EOF)"`. Edit the relevant sub-issue (or epic) body to include the missing requirement. Re-run the verification on the fixed issues to confirm — re-using whichever reviewer(s) flagged the gap is fine.
- Save the final verification report to `$PLAN_FILE` under a `## Verification Report` section. When multiple reviewers ran in parallel, save one subsection per reviewer (e.g. `### Codex verification`, `### GitHub Copilot verification`, `### Sonnet verification`). If a flagged reviewer was skipped (rate limit / timeout) and Sonnet ran as fallback, note the skip under its own subsection.

Do not skip this step even if the plan looks obviously complete.

### 10. Close source issues (existing-issue mode only)

If the plan was started from existing issues (Step 1b), close each source issue with a comment linking to the new epic.

For each source issue:

```bash
gh issue comment <source-issue-number> --body "Superseded by the big-plan epic: {epic-url}

Follow-up work is now tracked on that epic and its sub-issues."

gh issue close <source-issue-number>
```

Report each close to the user.

### 11. End the session

Print a summary. **The decisions table is mandatory** — never omit it. The user reviews this table to confirm or override each sub-task's execution mode, model, and wave before running `/x-wt-teams`.

**Default — one `/x-wt-teams {epic-issue-url}` invocation runs the entire plan.** `/x-wt-teams` reads the epic body, expands every sub-issue into a topic, respects each sub-issue's dependency order (so wave-N sub-issues run before wave-N+1 sub-issues), and caps concurrent children at 6. The "Wave" annotations are a planning aid for the human; execution sequencing is driven by the per-sub-issue `Depends on: #N1, #N2` notes and the concurrency cap.

**No planning flags get forwarded.** Print the `/x-wt-teams` line without appending `-op`/`-so`/`-haiku` or `-co`/`-gco`/`-gcoc`, even when the user originally invoked `/big-plan` with them. Per-sub-task models are already recorded in the sub-issue bodies, and reviewer flags for the implementation session are the user's choice (they add `-gcoc -co`, etc., to `/x-wt-teams` manually when they want a reviewer on the implementation session).

```
## Plan complete

Plan log: {PLAN_FILE}
Epic: {epic-url}

Sub-issues:
- Wave 1: {url} — {title}
- Wave 1: {url} — {title}
- Wave 2: {url} — {title}   (confirm)
- Wave 3: {url} — {title}
...

Base branch: base/{impl-title-slug}

Closed source issues: {list or "none"}
Verification: {all clear / N fixes applied}

## Decisions per sub-task — review and override if needed

| # | Wave | Sub-issue | Mode | Model | Reason |
|---|---|---|---|---|---|
| 1 | 1 | [#N] {title} | subagents | opus | {one-line reason} |
| 2 | 1 | [#N] {title} | subagents | sonnet | {one-line reason} |
| 3 | 2 | [#N] {title} (confirm) | subagents | sonnet | {one-line reason} |
| 4 | 3 | [#N] {title} | subagents | opus | {one-line reason} |
...

To override:
- **Per sub-task mode/model** — edit the sub-issue body and change the `Execution mode:` or `Model:` marker line. `/x-wt-teams` reads these per topic.
- **Per sub-task wave/dependencies** — edit the sub-issue body's `Wave:` line and `Depends on:` notes. `/x-wt-teams` honors the dependency notes when ordering topic spawning.
- **Session-wide model** — pass `-haiku` / `-so` / `-op` to `/x-wt-teams` to force every topic to one model (overrides every annotation).

---

This session is done. Token cost grows quadratically with session length —
start a **fresh session** and run:

  /x-wt-teams {epic-issue-url}

If the plan is large enough that running it in one session feels risky (likely
context overflow, or you want a manual checkpoint between phases), run waves
manually instead: close the epic's later-wave sub-issues temporarily, run
`/x-wt-teams {epic-issue-url}` for Wave 1, reopen the next wave's sub-issues
when ready, then check out `base/{impl-title-slug}` and re-run with `--stay`:

  /x-wt-teams -s {epic-issue-url}

The `--stay` flow reuses the existing epic base instead of creating a new one,
so each wave's worktrees branch off the already-merged previous wave.
```

Fill in every row from the per-sub-task classifications recorded in Step 3 / Step 3.5. The table must list every sub-issue created in Step 8, sorted by Wave then by creation order within each wave. The "Reason" column is the same one-line reason already stored in the plan log and the sub-issue body markers — copy it verbatim.

Do NOT start implementing. Do NOT create the base branch. The next session (`/x-wt-teams`) handles that.

## Naming Conventions

| Thing | Format | Example |
|---|---|---|
| `impl-title` display | Title Case, short | `Team Feature` |
| `impl-title` slug | kebab-case | `team-feature` |
| Epic issue title | `[{Impl Title}][Epic] {description}` | `[Team Feature][Epic] Team management` |
| Sub issue title | `[{Impl Title}][Sub] {task}` | `[Team Feature][Sub] D1 schema migration` |
| Base branch | `base/{impl-title-slug}` | `base/team-feature` |
| Plan log file | `{YYYYMMDD_HHMMSS}-big-plan-{slug}.md` | `20260412_1530-big-plan-team-feature.md` |

## Issue Labels

Every issue this skill creates carries a tier label so the hierarchy is scannable at a glance in the GitHub issue list. Each tier uses a distinct color hue to make them easy to tell apart visually.

| Tier | Label | Color | Used in |
|---|---|---|---|
| Epic | `epic` | `#1D76DB` (blue) | Step 7 |
| Sub | `sub` | `#0E8A16` (green) | Step 8 |

**Ensure labels exist before the first `gh issue create` call of the session.** Run this bootstrap block once per session. Safe to re-run — `gh label create` is only invoked when the label is missing, so pre-existing customized colors are preserved:

```bash
ensure_label() {
  local name="$1" color="$2" desc="$3"
  if ! gh label list --limit 200 --json name --jq '.[].name' | grep -Fxq "$name"; then
    gh label create "$name" --color "$color" --description "$desc"
  fi
}

ensure_label "epic" "1D76DB" "Big-plan epic tracking multiple sub-issues"
ensure_label "sub"  "0E8A16" "Big-plan sub-task under an epic"
```

Apply `--label {tier}` on each `gh issue create` — epic issue: `--label epic` (Step 7); each sub-issue: `--label sub` (Step 8).

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

Can be combined with `-co` — see Step 5 for how multiple reviewers run in parallel. Mutually exclusive only with `-gcoc` (same tool, different model).

When `-gco` or `--github-copilot` is passed, the following tooling is enabled:

| Workflow slot | GCO tool | Used for |
|---|---|---|
| Step 5 second opinion | `/gco-2nd` | Copilot review of the plan |
| Step 2 research (if needed) | `/gco-research` | Web research during exploration |

**How it affects the workflow:**

- **Step 2 (Explore the codebase)**: When you need to research libraries, APIs, or best practices, prefer `/gco-research` over the Agent tool or WebSearch.
- **Step 5 (Second opinion)**: Invoke `/gco-2nd` — in parallel with `/codex-2nd` if `-co` was also passed. If Copilot is rate-limited, `/gco-2nd` silently skips — fall through to the Plan subagent fallback for that reviewer.

All other workflow steps (issue creation, verification, etc.) remain unchanged.

## GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

Same as `-gco` above, but forces the free `gpt-4.1` model (skips the Premium opus attempt). Can be combined with `-co`. Mutually exclusive with `-gco` (same tool, different model — pick one).

When `-gcoc` or `--github-copilot-cheap` is passed, the following tooling is enabled:

| Workflow slot | GCOC tool | Used for |
|---|---|---|
| Step 5 second opinion | `/gcoc-2nd` | Copilot (cheap) review of the plan |
| Step 2 research (if needed) | `/gcoc-research` | Web research during exploration |

**How it affects the workflow:**

- **Step 2 (Explore the codebase)**: When you need to research libraries, APIs, or best practices, prefer `/gcoc-research` over the Agent tool or WebSearch.
- **Step 5 (Second opinion)**: Invoke `/gcoc-2nd` — in parallel with `/codex-2nd` if `-co` was also passed. If Copilot is rate-limited, `/gcoc-2nd` silently skips — fall through to the Plan subagent fallback for that reviewer.

All other workflow steps (issue creation, verification, etc.) remain unchanged.

## Key Principles

- **Parent branch is the current branch — NOT `main`** — `/big-plan` is invoked on the branch the new feature will land on. Capture `$PARENT_BRANCH = git rev-parse --abbrev-ref HEAD` first and use it everywhere a base branch parent or PR target is needed. Do not silently assume `main`. Surface the detected `$PARENT_BRANCH` to the user in Step 6 (especially when it is not `main`) so they can correct it
- **No code changes in this session** — planning and issue creation only. No branches, no commits, no pushes
- **One epic per plan, no exceptions** — even huge plans stay in a single epic. Scale via more sub-issues sequenced into dependency waves, not via multiple epics. The user runs the waves as separate `/x-wt-teams --stay` sessions on the same epic base. Splitting into multiple epics costs more (multiple PRs to manage, manual cross-epic coordination) without saving meaningful manager-context tokens
- **Read project lessons before planning** — Step 1c auto-reads any matching `l-lessons-*` skills (written by `/retro-notes`) so previous attempts in the same area inform the plan. Skip silently if none apply
- **Save the plan log first** — before codex, before confirmation, before issues. It's the source of truth
- **Confirm before creating** — always show the plan to the user first
- **Verify after creating** — always verify so original requirements aren't lost. Default reviewer is the Sonnet subagent; when `-co`/`-gco`/`-gcoc` is passed, those tools handle verification (in parallel if multiple), with Sonnet as fallback if any are rate-limited
- **Annotate execution mode per sub-task — mandatory** — every sub-task MUST be classified as `subagents` (default) or `teams` based on whether it needs mid-flight inter-agent communication. The annotation lives in the plan log, the created sub-issue body, AND the final summary table (Step 11). `/x-wt-teams` reads it per topic to choose how to spawn children. Default to subagents; only mark `teams` when a sub-task genuinely depends on another child's mid-task output
- **Annotate model per sub-task — mandatory** — every sub-task MUST be classified `sonnet` (default), `opus`, or `haiku` based on the kind of work. The annotation lives next to the execution-mode line in the plan log, the sub-issue body, AND the final summary table (Step 11). `/x-wt-teams` reads it per topic and spawns each child with the matching model. A manual `-haiku` / `-so` / `-op` flag on `/x-wt-teams` overrides every topic's annotation as a session-wide manual override. **Default `sonnet` when in doubt** — `/big-plan` already settled the hard decisions; most sub-tasks are mechanical implementation. Pick `opus` only when the deliverable benefits from larger-model creative quality: high-quality Japanese-language writing, creative UI design, pattern-generation / visual-creative algorithms (e.g., pgen patterns or GLSL shaders). `haiku` is rare
- **Annotate wave per sub-task — mandatory** — every sub-task MUST carry a `Wave:` number reflecting its position in the dependency chain (see Step 3.5). Wave size respects `/x-wt-teams`'s 6-concurrent-agent cap. Insert dedicated "confirm" sub-issues at risky cross-phase boundaries (e.g., between backend and frontend waves) rather than splitting into multiple epics. Wave annotation lives in the plan log, the sub-issue body, AND the final summary table
- **Final summary table is mandatory** — Step 11 MUST include the per-sub-task decisions table showing `Wave`, `Mode`, and `Model` for every sub-task, with the one-line reason. The user reviews this table to confirm or override decisions before running `/x-wt-teams`. Never omit it — even when the plan looks obvious, the user needs the table to spot mistakes and override
- **Planning flags do NOT forward to the hand-off** — `-op`/`-so`/`-haiku` and `-co`/`-gco`/`-gcoc` shape only the planning session itself. The Step 11 hand-off MUST print the `/x-wt-teams` line in plain `/x-wt-teams {url}` form with no flags appended, even when the user originally invoked `/big-plan` with those flags. Per-sub-task models are already recorded in the issue bodies (Step 8 markers); reviewer flags for the implementation session are the user's choice and are added to `/x-wt-teams` manually. The split keeps planning concerns and implementation concerns from leaking into each other
- **Small issues win** — an issue that takes 15 agent exchanges is better than one that takes 50
- **Self-contained sub-issues** — each issue body must be readable standalone, without needing this session's context
- **Fresh session next** — always end by instructing the user to start a new session and run `/x-wt-teams {epic-url}`. Wave ordering is encoded in dependency markers; `/x-wt-teams` honors them within a single session, so one invocation typically handles the whole plan. Manual per-wave checkpointing via `--stay` is documented as an exception, not the default
- **No `~` in paths** — always use `$HOME`
