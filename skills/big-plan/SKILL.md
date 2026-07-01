---
name: big-plan
description: "Plan implementation by breaking work into one epic GitHub issue + child sub-issues. Use when: (1) User says '/big-plan', (2) User wants to plan an implementation before coding, (3) User wants to split a feature into small issues for parallel agent team work, (4) User references existing issues (e.g. 'implement issue #123', 'plan all open issues', 'plan recent 3 open issues'). Auto-reads project-scope l-lessons-* skills (from /retro-notes) before planning. Codex (-co) is the DEFAULT Step 5 plan reviewer — it runs even when no reviewer flag is passed; -op adds more second opinions (runnable in parallel). Use -a/--auto to run the chain autonomously: skip the Step 6 confirmation wait (pausing only when something needs careful consideration), auto-create the issues, then auto-invoke the implementation skill in the same session — /x-wt-teams for a multi-sub-issue plan, /x-as-pr for a single-sub-issue plan — forwarding -a so multi-wave plans auto-chain wave after wave. Use -m/--merge to also merge the final PR into the base branch at the end (plus cleanup and base-branch CI watch with auto-fix on red): -m triggers the same auto-invoke of the implementation skill (keeping the Step 6 confirmation unless -a is also passed) and forwards -m downstream. -a and -m are orthogonal — full hands-off plan → impl → merge → cleanup is -a -m. Large scope is kept in ONE epic and sequenced into dependency waves, run by a single /x-wt-teams session in dependency order (not multiple --stay sessions; manual --stay checkpoints are reserved for design-decision plans that need review between waves). Planning only — no code changes (unless -a or -m is set, in which case implementation also runs in-session)."
argument-hint: <description-or-issue-refs> [-op|--opus] [-co|--codex] [-nor|--no-review] [-a|--auto] [-m|--merge] [-pc|--parent-confirmed] [-f|-fix|--auto-fix] [-nf|--no-fix] [-ri|--raise-issues] [-nori|--no-raise-issues]
---

# Big Plan

Planning-only skill. Explore the codebase, propose a breakdown, save a plan log to `$HOME/cclogs/{slug}/`, get a second opinion (codex by default; Opus via flag), create GitHub issues, verify nothing was lost, and hand off to `/x-wt-teams` in a fresh session.

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md). Create/edit the epic + sub-issues via the GitHub MCP (`issue_write`, `sub_issue_write`), not `gh`, and pre-create the `epic`/`sub` labels (no create-label MCP tool). The default Codex Step-5 plan reviewer (`-co`) is unavailable — use a **Claude** reviewer (e.g. `/opus-2nd`) and ignore `-co`. Plan logs land in the ephemeral `/tmp` cclogs stub, so persist anything important into the epic issue body. The `/x-wt-teams` / `/x-as-pr` it auto-invokes runs **subagents-only** (no agent teams). **Branch model — see web-mode.md §5:** the `claude/*` session branch IS the base (`$WEB_BASE`); there is no `base/{slug}`, parent = the fork-from branch (`$WEB_PARENT`, today the repo default). Write issue bodies, the Step 6 proposal, and the Step 11 pause checks against that — the session branch being non-`main` is **normal**, not a nested-base warning, and is NOT a pause condition. When writing the base-branch name into any issue body, substitute the **resolved literal** name (`git branch --show-current`, e.g. `claude/serene-galileo-7uqa3g`), never the token `$WEB_BASE`. **Super-epic plans are unsupported on web** — if a plan would be super-epic, say so and stop (run it from the terminal).

> **In a limited verification env (Claude Code web)** the implementation session's final visual / Mac-only check can't run. `/big-plan` is planning-only, so the actual `mac`-label handoff fires **downstream** in the `/x-as-pr` / `/x-wt-teams` it invokes (they receive `-m` / `-v` and own it) — see [`web/mac-handoff.md`](../../web/mac-handoff.md). `/big-plan`'s only jobs here: seed the `mac` label in the label bootstrap (Step "Bootstrap labels") so it exists for the downstream skill, do **not** add a Step 11 pause for this, and let the `-m` cleanup tail keep `mac-deferred` issues open.

This skill is useful for **almost every implementation task**, not just huge ones. It captures intent, breaks work into reviewable units, and creates a paper trail that survives context compression.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **`-op` or `--opus` flag**: If present, get an Opus second opinion on the saved plan (Step 5). Spawns a forked Opus subagent via `/opus-2nd`. Applies to the **planning session only** — **NOT forwarded** to the `/x-wt-teams` hand-off. Can be combined with `-co` to run multiple reviewers in parallel. Uses Anthropic quota — pick when the plan is consequential enough to justify Opus over the cheaper Codex option. Does **NOT** affect Step 9 verification — that always runs on Sonnet.
- **`-co` or `--codex` flag**: **DEFAULT — the codex second opinion runs even when no reviewer flag is passed.** Codex is the house default 2nd agent; pass `-co` explicitly for clarity, the behavior is identical. Gets a Codex second opinion on the saved plan (Step 5). If codex is rate-limited or unavailable, `/codex-2nd` silently falls back to **Opus** (general-purpose subagent at `model: opus`) — same second opinion, just from Opus instead of codex. Applies to the **planning session only** — **NOT forwarded** to the `/x-wt-teams` hand-off. Reviewer flags for the implementation session are the user's choice; they add `-co` to `/x-wt-teams` themselves at invocation time when they want one. Can be combined with `-op` to run multiple reviewers in parallel. Does **NOT** affect Step 9 verification — that always runs on Sonnet.
- **Multiple reviewer flags** — any combination of `-op` and `-co` can be specified together. Every specified reviewer is invoked in parallel during Step 5 and their feedback is consolidated into a single `## Review Notes` section before user confirmation. With no reviewer flag at all, Step 5 still runs with the codex default (`/codex-2nd`).
- **`-nor` or `--no-review` flag**: If present, run the planning end-to-end with no confirmation gates and no review steps. Skips Step 5 (second opinion — including the default codex review), Step 6 (propose-to-user wait), and Step 9 (requirements verification). The plan is drafted, the log is saved, the issues are created, and the session ends. Use when you've already decided what to plan and just want the issues created. Mutually compatible with `-co` — but that reviewer flag becomes a no-op when `-nor` is also present (no review runs).
- **`-a` or `--auto` flag**: Autonomy flag — run the whole chain autonomously. Two effects:
  - **Step 6**: skip the confirmation wait and auto-create the issues, the same one-shot-summary shape as `-nor`. **Quality gates stay on** — Step 5 (review) and Step 9 (verification) still run (unlike `-nor`, which drops them). The auto-create is **conditional**: if something needs careful consideration, fall back to the normal Step 6 ask-and-wait instead of auto-proceeding. The "careful consideration" signals evaluable at Step 6 are (1) `Plan mode: design-decision` (Step 3.6) and (2) `$PARENT_BRANCH` looks **foreign** — i.e. a working branch, not a base branch (see "Base-like vs foreign parent" in Branch Context). A base-like parent (`main` / `develop` / `base/*` / `staging` / `release/*`) does **NOT** fire, so the common autonomous case proceeds without asking. **On web this signal-2 does NOT fire at all** (the `claude/*` session branch is the base, not a nested parent; see web-mode.md §5), the same as if `-pc` were passed. Signal 1 (`design-decision`) is **unchanged on web** — a design-decision plan still pauses. Step 9's verification signal isn't included here because verification hasn't run yet at Step 6 — Step 11 checks it before auto-invoking.
  - **Step 11**: auto-invoke the implementation skill (`/x-wt-teams` for a multi-sub-issue plan, `/x-as-pr` for a single-sub-issue plan) via the Skill tool in the same session, **forwarding `-a`** so the implementation chains autonomously too (`/x-wt-teams -a` auto-continues multi-wave / multi-session plans). See Step 11 for the routing and pause conditions.
  - `-a` does **NOT** merge the final PR — merging is `-m`'s job. The two are orthogonal and compose: `-a -m` = plan → impl → merge → cleanup with no human in the loop.
  - **Combinable**: with reviewer flags (`-op`/`-co`, which shape Step 5 only and are never forwarded), with `-m` / `-nf` / `-nori` (which forward downstream alongside `-a`), and with `-nor` (which already skips Step 5/6/9; `-a`'s Step 6 behavior is then moot and the Step 11 auto-invoke remains).
- **`-m` or `--merge` flag**: Merge flag. `/big-plan` itself never merges anything — planning ends before implementation — so `-m` does two things: (1) it triggers the **same Step 11 auto-invoke** of the implementation skill as `-a` (the merge can only happen if implementation runs in-chain), and (2) it **forwards `-m`** to that skill, which — when the final implementation is done — merges the PR into the base branch, runs the cleanup phase, and watches CI on the base branch (fixing it if it goes red). Unlike `-a`, `-m` alone does **NOT** skip the Step 6 confirmation — autonomy is `-a`'s job; `-m` only adds the merge tail. Pass both (`-a -m`) for full hands-off. Step 11's pause conditions apply to the `-m` chain the same way they apply to `-a`.
- **`-pc` or `--parent-confirmed` flag**: Declares the detected `$PARENT_BRANCH` intentional even when it looks **foreign** (a working branch rather than a base-like branch — see Branch Context). For orchestrating skills (e.g. `/review-loop`, which invokes `/big-plan -m -a` from its own review branch every round): the foreign-parent concern signal is treated as already confirmed — it no longer triggers the Step 6 ask-and-wait fallback under `-a` nor Step 11's pause condition 2. (A base-like parent never raises the signal in the first place, so `-pc` only matters on a foreign-looking branch.) It suppresses **only** that signal; the design-decision and unresolved-verification pauses still apply. Without `-a` / `-m` the flag is inert (the normal Step 6 proposal already surfaces the parent branch for confirmation).
- **`-f` / `-fix` / `--auto-fix` and `-nf` / `--no-fix` flags**: Planning-only skill — `/big-plan` does **not** implement auto-fix itself; the downstream skills (`/x-wt-teams`, `/x-as-pr`) run their auto-fix step **by default**. So `-f` is only the explicit form of the downstream default; the flag that changes behavior is `-nf` / `--no-fix`, which **parses and forwards** in the Step 11 hand-off when the chain runs (i.e., when `-a` or `-m` is also set) to skip the downstream auto-fix. Without `-a` / `-m`, both are inert (there is no in-session implementation to forward to) — note it but take no action. Orthogonal to the reviewer / `-nor` flags. See Step 11.
- **`-ri` / `--raise-issues` and `-nori` / `--no-raise-issues` flags**: Same parse-and-forward treatment — issue-raising for unrelated/deferred findings is the downstream default (`-ri`), so only `-nori` changes behavior: forward it in the Step 11 hand-off so the implementation session (and its reviewers) keep findings terminal-only. Inert without `-a` / `-m`.
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

> **On web (`$CLAUDE_CODE_REMOTE=true`) — see web-mode.md §5.** Run the canonical detection there instead: `$PARENT_BRANCH` here IS `$WEB_BASE` (the `claude/*` session branch, the **base** — not the parent), and the parent (root-PR target) is `$WEB_PARENT` (the fork-from / default branch). Capture once. The "not `main` → nested-base" logic below does NOT apply (the session branch is never `main`). `git rev-parse --abbrev-ref HEAD` returns the literal `HEAD` in detached state — on web use `git branch --show-current` (empty-on-detached, which §5 treats as a hard error) instead.

**Why this matters — read carefully:**

`/big-plan` is typically invoked **on the branch the new feature will land on**. The default assumption is NOT "PR into `main`" — it is "PR into whatever branch I'm on right now."

- If `$PARENT_BRANCH` is `main` (the common case) → new `base/{impl-title-slug}` is branched from `main` and its PR targets `main`. Behave as before.
- If `$PARENT_BRANCH` is anything else (e.g. `base/foo-impl`, `develop`, `feature/x`) → new `base/{impl-title-slug}` is branched from `$PARENT_BRANCH` and its PR targets `$PARENT_BRANCH`. This is the **nested-base** pattern (e.g. `base/new-impl` → `base/foo-impl` → `main`). Routing always honors `$PARENT_BRANCH` — do **NOT** silently swap in `main`, whatever the branch is named.

(Routing — the rule above — is independent of the *confirmation gate*. Routing always nests off `$PARENT_BRANCH`; the gate below decides only whether to **pause and ask** before doing so, based on whether the parent looks base-like or foreign.)

**Use `$PARENT_BRANCH` everywhere this skill previously hardcoded `main`:**

- Step 7 epic body — "merges into `$PARENT_BRANCH` as one PR" (not "merges into main")
- Step 8 sub-issue bodies — `Base branch: base/{impl-title-slug}` ... "(which itself targets `$PARENT_BRANCH`)"
- All hand-off messages mentioning the eventual merge target

**Surface the parent branch to the user in Step 6 (proposal)** so they can correct it if they accidentally invoked from the wrong branch. Always show it; gate on it (call it out as a confirmation point, and fall back to ask-and-wait under `-a`) only when it looks **foreign** per the test below.

**Base-like vs foreign parent — the confirmation-gate test.** The parent-branch gate (Signal 2 at Step 6 and Step 11) exists to catch an *accidental* invocation from a throwaway working branch — where silently nesting a whole epic under it would surprise the user — NOT to question every parent that isn't `main`. Under `-a` the user has asked to proceed autonomously, so the gate is worth firing only when the branch clearly looks like the wrong place to land an epic. Classify `$PARENT_BRANCH`:

- **base-like** → gate does **NOT** fire; proceed silently (this is the normal autonomous case). A branch meant to *receive* merges: `main` / `master`, `develop` / `development` / `dev`, `staging`, `release/*`, or this skill's own `base/*` convention.
- **foreign** → gate fires; confirm under `-a`. A branch whose name reads like a single unit of work: `feature/*`, `feat/*`, `fix/*`, `bugfix/*`, `hotfix/*`, `chore/*`, `refactor/*`, `wip/*`, `topic/*`, `agent-fix/*`, and the like.

When genuinely unsure, lean base-like — a needless pause is exactly what `-a` is meant to avoid. (`-pc` / `--parent-confirmed` and web mode both suppress this gate entirely, regardless of classification.)

## Cross-machine portability

Implementation usually runs in a fresh session — **often on a different machine** (via `/x-wt-teams`). That machine has the same repo layout. cclogs is now Dropbox-synced, so the plan log *does* eventually reach the other machine — but don't rely on it: Dropbox sync isn't instant, and the implementer agent has no reason to go digging in cclogs. The plan log you save in Step 4 is a planning-session artifact the implementer never sees; everything they need must live in the **GitHub issues**, the artifact you design for crossing machines.

So when the plan references a local file or another repo, express it portably in the issue body:

- **Another repo** → `$HOME/repos/{repo}/...`. The `repos/` layout is identical across machines; a machine-absolute path (`/Users/...`, `/home/takaz/...`, `/mnt/c/Users/...`) breaks on the other machine. Never paste one into an issue.
- **Long text / plan detail the implementer needs** → distill it down to the *minimal* spec the implementer actually needs and put that in the issue body or a comment. Do **not** point them at the `$HOME/cclogs/...` log path — even though it's Dropbox-synced now, sync lag and discoverability make it the wrong handoff surface.
- **Full conversation logs, raw transcripts, or large unfiltered text** → **never paste or attach these to a GitHub issue.** On a public repo it leaks whatever the conversation happened to contain (client names, local paths, secrets, half-formed ideas); even on a private repo it bloats the issue, since the implementer needs the distilled spec (previous bullet), not the raw chat. This material is reference for *this* session only — keep it in the Dropbox cclogs dir (`$DROPBOX_CCLOGS_DIR/{repo}/...`), never in any issue.
- **Images / visual context** → embed via `/gh-issue-with-imgs`, or share through the Dropbox dir and reference `$DROPBOX_SCREENSHOTS_DIR/...` (the dir `/ss` reads).
- **Prototype html/js/css that can't live in an issue** → if it's throwaway, keep it in the Dropbox cclogs dir (`$DROPBOX_CCLOGS_DIR/{repo}/...`). But if the implementation session genuinely NEEDS it (a design reference, fixtures, sample data the implementer must read), Dropbox is the wrong channel — the implementer often runs on **Claude Code web**, which has no Dropbox. Commit it into the repo under `_temp-resource/{epic#}-{slug}/` and reference that in-repo path. See the **resource-handoff** subsection below and the `dev-setup-temp-resource` skill.

Test each issue body: _on a machine with the repos, working only from the issue (not from this planning session's cclogs log), could I still do the work?_ If not, move the missing context into the issue.

### Resource handoff via a base branch (only when the implementer needs files)

Default: this session creates issues only; `/x-wt-teams` creates the base branch. **Exception** — when the plan must hand the implementation session resources that can't live inline in an issue (a prototype, a design mockup + screenshots, fixtures), and that must survive a handoff to a fresh session or to Claude Code web (no Dropbox): follow the `dev-setup-temp-resource` skill. After the epic + sub-issues exist (Step 8, so the epic number is known), create `base/{impl-title-slug}` from `$PARENT_BRANCH`, commit the resources under `_temp-resource/{epic#}-{slug}/`, open the **base PR**, and add a "**Use this PR as base**" note to the epic body so `/x-wt-teams` reuses that branch instead of creating a new one. Skip this entirely when no files need delegating (the common case). Surface the base branch/PR in the Step 6 proposal and the Step 11 hand-off. **On web (see web-mode.md §5):** there is no separate `base/{slug}` — commit `_temp-resource/...` directly onto `$WEB_BASE` (the session branch) and the base PR is `$WEB_BASE` → `$WEB_PARENT` (deferred until that first commit exists); the "Use this PR as base" note then just means "resources are already on the session branch — do NOT `git checkout` a different branch."

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

Explore all relevant code and produce a **structured map** that feeds the breakdown (Step 3) and wave sequencing (Step 3.5). This is the expensive step that justifies a dedicated session — invest in it.

The deliverable is not a vibe; it is a concrete map covering:

- **Call-sites** — where the affected behavior is invoked from, and who depends on it.
- **Dependencies** — modules, packages, services, and contracts the change touches (upstream and downstream).
- **Files to change / create** — the concrete list each sub-task will edit, so Step 3 can size and split work.
- **Blast radius** — what else could break, which surfaces need a confirm sub-issue (Step 3.5), and where the risky cross-phase boundaries are.

**Structure the exploration as a parallel-reader fan-out for non-trivial scope.** When the change spans multiple subsystems or the file set is large, **use the Workflow tool to fan out N parallel readers** — one per affected subsystem — and synthesize their findings into the single structured map above. (This skill instructing you to call the Workflow tool IS the opt-in — the user never has to type "workflow".) The Workflow tool is the right fit here precisely because exploration is embarrassingly parallel read-only work that collapses into one synthesis.

**Keep it proportionate.** Small or single-subsystem plans do NOT need a fan-out — a direct read-through producing the same structured map is fine and cheaper. Reserve the parallel-reader fan-out for genuinely non-trivial scope. Reading existing patterns, understanding the architecture, and identifying what changes still applies either way.

> The Workflow tool is used **only here**, in exploration. The Step 5 reviewer fan-out stays Skill-based (codex / opus-2nd), and the Step 9 verification subagent stays a single Agent-tool call on Sonnet — do not route those through Workflow.

If you need to research libraries, APIs, or best practices during exploration, use the Agent tool / `/codex-research` / WebSearch as appropriate.

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

**Guiding principle:** `/big-plan` already captured the hard decisions — architecture, dependencies, trade-offs, acceptance criteria. Each sub-task is "follow this spec to land this change." For most sub-tasks, that's mechanical implementation work, and **Sonnet handles it correctly, faster, and cheaper**. Opus is reserved for sub-tasks whose deliverable specifically benefits from top-model quality.

- **`sonnet`** (default) — pick for the bulk of implementation work: well-defined refactors, schema/migration changes, route plumbing, hook wiring, dispatcher logic, capability detection, lifecycle integration, test scaffolding, build/CI config, dep bumps, mechanical CLI flags, English technical documentation, follow-the-pattern code. Anything where the spec from `/big-plan` makes the answer clear and the agent is mostly executing.
- **`opus`** — Opus 4.8, Anthropic's top model (it runs with a 1M-token context window), the tier above sonnet. Pick only when the sub-task's quality bar genuinely benefits from the top model:
  - **High-quality Japanese-language writing** — translation, native-feel prose, nuanced tone (esa / zpaper / CodeGrid articles, Japanese UI copy, marketing copy where reading like a native speaker matters).
  - **Creative UI work** — original visual design, polished interaction design, layout judgment for a new surface, novel component look-and-feel. Generic "add a button to an existing surface" UI work is sonnet — opus is for when visual taste actually moves the result.
  - **Pattern generation / visual-creative algorithms** — GLSL fragment shaders, generative art, noise/warp/distortion code, anything where "this looks right" depends on aesthetic judgment (e.g., the pgen app's pattern generators).
  - **Genuinely difficult problem-solving** — subtle correctness questions, intricate algorithm work, complex async / state-machine logic, race-condition-prone code, novel architectural decisions that `/big-plan` couldn't fully spec out. If the sub-task needs real reasoning *beyond* "follow this spec," lean Opus. Rare when `/big-plan` did its job thoroughly, but **err on the side of Opus when difficulty is hard to judge** — paying for one Opus run is cheaper than re-doing a Sonnet run that got the subtle case wrong.
- **`haiku`** — only for genuinely trivial work: a typo fix, a one-line config tweak, an obvious mechanical edit. Cautious by default — Haiku is a real downgrade on anything ambiguous.

Default to **`sonnet`** when in doubt. Pick `opus` only when there's a clear quality reason from the list above. `haiku` is rare.

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

`/x-wt-teams` reads this annotation per topic and spawns each child with the matching model. A manual `-t-op` / `-t-so` flag on the `/x-wt-teams` invocation **overrides every topic's annotation** session-wide (manual override). Without a flag, per-topic annotations are honored — different topics in the same session can run different models. Note: the `-op` / `-so` / `-haiku` flags on `/x-wt-teams` are reviewer flags and do NOT affect child models.

Record the choice and a one-line reason per sub-task. The annotation goes next to the execution-mode line in both the plan log (Step 4) and the created sub-issue bodies (Step 8).

### 3.5. Sequence sub-tasks into waves and insert confirm sub-issues at risky boundaries

**Always one epic — never split into multiple epics.** Even when scope is large, the answer is more sub-issues sequenced into dependency waves under the same epic. Manager-context savings from splitting epics are not real in practice; managing one chained epic is simpler than juggling multiple sessions, and a single `/x-wt-teams {epic-url}` session already runs all the sub-issues in dependency order (driven by the `Depends on:` markers, throttled to 6 concurrent children).

**Group sub-tasks into waves.** A wave is a set of sub-tasks that can run concurrently in one `/x-wt-teams` session. Waves run sequentially — wave N+1 starts only after every sub-task in wave N is merged into the epic base.

- **Wave size ≤ 6 is a planning annotation, not a session boundary** — `/x-wt-teams` enforces the 6-concurrent-child cap itself (to avoid freezing the local machine), throttling within a single session. You annotate waves for the human's benefit; you do NOT split work across sessions to honor the cap. If a dependency tier exceeds 6, label it wave Na / wave Nb so the grouping is readable — one session still executes both. **On web (web-mode.md §6) the 6-cap is lifted** (cloud container, not your Mac), so wave Na/Nb sub-splitting for the cap reason is unnecessary — a wave can fan out all its sub-tasks at once.
- **A single huge plan stays one epic** — 18 truly parallelizable sub-tasks is one epic run by one `/x-wt-teams {epic-url}` session (6 at a time), not three epics and not three sessions.
- **A typical multi-phase plan is also one epic** — e.g., `wave 1: backend (4 sub-tasks)` → `wave 2: backend confirm (1 sub-task)` → `wave 3: frontend (3 sub-tasks)`. One session runs all three waves in dependency order; one epic; one PR. (Multi-session `--stay` is the exception — only when the user wants to review artifacts between waves; see Step 11.)

**Insert "confirm" sub-issues at risky cross-phase boundaries.** When a downstream wave depends on the previous wave's deliverable working correctly (not just landing), add a dedicated confirm sub-issue between them. The confirm sub-issue is a small, focused validation pass — its acceptance criteria are "exercise the upstream surface, run the integration check, fix anything broken." Treat it like any other sub-task: it has its own execution mode, model, and one-line reason.

Reach for a confirm sub-issue when:

- Wave N+1 calls into Wave N's API/contract and a regression there would silently break N+1 (e.g., backend returns the wrong shape and frontend ships looking fine because it never throws).
- Wave N+1's correctness depends on a behavior that's hard to assert from inside an individual Wave N sub-task (cross-cutting integration, end-to-end smoke test, schema-level invariant).
- Multiple Wave N sub-tasks land independently and their interaction needs a sanity check before Wave N+1 commits.

A confirm sub-issue is normally `subagents` mode + `sonnet` model — its job is to validate, not invent. Acceptance criteria should name the exact checks to run.

**Per sub-task, record its wave number** in the plan log (Step 4) and the sub-issue body (Step 8) so the user can read the dependency grouping at a glance (and, if they opt into the manual checkpoint flow, which `--stay` session each sub-issue belongs to). Format: `**Wave:** {N}` on its own line, alongside the `Execution mode:` and `Model:` markers.

**Dependency notes still belong on each sub-task** — call out specific upstream sub-issues (`Depends on: #N1, #N2`) separately from the wave number. `/x-wt-teams` honors these `Depends on:` markers to order topic spawning within the single session, so they are what actually drives execution sequencing (the wave number is the human-readable view).

### 3.6. Classify the plan: goal-clear vs. design-decision — bake decisions accordingly

**Not every plan needs human checkpoints between waves.** The deciding factor is whether the waves contain unresolved DECISIONS that need human judgment, or only analytical decisions an agent can make from the inputs.

Classify the plan into one of two modes before Step 4 (save plan log).

#### Goal-clear (default for bugfix, regression, refactor, performance, parity, migration)

The success criterion is unambiguous and derivable from the inputs:

- The bug doesn't reproduce.
- The test passes.
- The benchmark hits N.
- The user sees the right pixels.

Inter-wave human checkpoints **do not help** in this mode — they only delay the work and consume the user's time. The user's time is a real cost; gating on it for goal-clear plans is anti-leverage.

**Rule for goal-clear plans:** wherever the original plan would benefit from "stop here and let the user decide", instead **insert a dedicated decision sub-task with `model: opus`** that consumes the prior wave's output and produces the input the next wave needs. Common shape:

- Reads the upstream artifact (e.g. a `findings.md`, an audit, a labeled-set result).
- Picks among the alternatives the upstream sub-task surfaced.
- **Edits the downstream sub-issue's body via `gh issue edit`** to lock in the concrete file:symbol-granularity spec.
- No production code touched.
- Wave: usually its own (a one-task wave sandwiched between the diagnosis wave and the implementation wave).

This is the structural replacement for "checkpoint after Wave N — review the findings". Opus does the harder judgment call autonomously; Sonnet implements the downstream task with a now-concrete spec.

**Concrete tells for goal-clear:**

- User explicitly framed the goal in unambiguous terms ("3 screenshots must match", "the test passes", "the bug doesn't repro", "performance ≥ X").
- The task is categorized as bugfix / regression / refactor / performance / parity.
- All "decisions" in the plan are analytical (which storage site, which fix, which model), not preferential.
- User said something like "the goal is clear", "it's just a bugfix", "categorized as bugfix", "don't stop wave".

#### Design-decision (default for new-feature, content-structure, UI-variation, scoping)

The success criterion depends on user preference that can't be derived from inputs. Examples:

- "Pick which UI pattern feels right out of 4 variations."
- "Decide what should be in scope for the first release."
- "Decide the content structure of the new docs section."

In this mode, inter-wave human checkpoints are appropriate *when the user genuinely needs to review each wave's artifacts before the next* — the user is the source of truth for the unresolved decision. Even so, the default hand-off is still the one-shot `/x-wt-teams {epic-url}` (review at PR time); the manual `-s` checkpoint flow for reviewing between waves is documented in Step 11.

**Concrete tells for design-decision:**

- User asked for "options", "variations", "patterns", "alternatives", "what do you think", "how should we approach", "which approach feels right".
- Feature scoping language ("should X be in scope?", "do we need Y?").
- Plan would produce 2+ artifacts that need user preference to choose between.

#### When in doubt — surface during Step 6 proposal

If the classification isn't obvious from the user's framing, ask explicitly during the Step 6 proposal: "Is this goal-clear (runs autonomously end-to-end) or design-decision (recommend manual checkpoints)?" Default to goal-clear if the topic is a bugfix and the user gave a concrete success criterion.

#### What this changes in subsequent steps

- **Step 4 (plan log)** — record the classification under a `**Plan mode:** goal-clear` or `**Plan mode:** design-decision` line in the plan log header.
- **Step 8 (sub-issue creation)** — for goal-clear plans, ensure dedicated Opus decision sub-tasks are present at every point that would otherwise require a human checkpoint.
- **Step 11 (hand-off summary)** — emit different defaults per the table in Step 11.

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
- **Wave order** — list every wave with its sub-tasks (e.g. `Wave 1: backend (4 sub-tasks)`, `Wave 2: backend confirm (1 sub-task)`, `Wave 3: frontend (3 sub-tasks)`). One `/x-wt-teams` session runs these in dependency order; the wave list is the human-readable view of that ordering (and maps to `--stay` sessions only if the user opts into the manual checkpoint flow).
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

### 5. Second opinion — codex (`-co`) by default; `-op` / `--opus` adds a reviewer

**Skip this step entirely if `-nor` / `--no-review` was passed**, even if one of the reviewer flags is also present. No `## Review Notes` section is added to `$PLAN_FILE`. Proceed directly to Step 6.

**This step runs by default.** When no reviewer flag was passed, run the codex reviewer (`/codex-2nd`) — codex is the house default 2nd agent. Reviewer flags shape the set: `-op` and `-co` may combine; every specified reviewer runs in parallel.

The review questions are the same regardless of tool:

1. Is the breakdown sound? Any sub-tasks too large or too coupled?
2. Are there missing sub-tasks or hidden dependencies?
3. Are there risks or edge cases not covered?
4. Is the dependency order correct? Can more run in parallel?
5. Are any original requirements from the source missing from the plan?

**Run every specified reviewer in parallel.** Determine which flags are active, then invoke the corresponding sub-skills concurrently (single assistant turn, multiple tool calls). **If no reviewer flag is active, invoke `/codex-2nd` — the codex default reviewer.** Each reviewer reads the same `$PLAN_FILE` and answers the same questions above — they don't need to coordinate.

> **Skill names are top-level, not plugin-namespaced.** Invoke via `Skill(skill="opus-2nd")`, `Skill(skill="codex-2nd")`. Do **NOT** use `codex:codex-2nd` — that namespace belongs to the openai-codex plugin and does not contain these skills.

**Per-flag invocation:**

- **`-op` / `--opus` — `/opus-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/opus-2nd/SKILL.md`. The skill spawns a `general-purpose` Agent with `model: opus`; pass the absolute `$PLAN_FILE` path as the argument. The Opus Agent reads the file itself.
- **`-co` / `--codex` (or no reviewer flag — codex is the default) — `/codex-2nd`** — Follow the invocation pattern in `$HOME/.claude/skills/codex-2nd/SKILL.md`. Pass the contents of `$PLAN_FILE` as context. If codex is rate-limited, `/codex-2nd` silently falls back to an Opus general-purpose subagent and returns Opus feedback in the same shape — no extra handling needed here.

**Consolidate feedback from all reviewers.** When multiple reviewers were invoked:

- Collect each reviewer's output.
- Under `## Review Notes` in `$PLAN_FILE`, add one subsection per reviewer (e.g. `### Opus review`, `### Codex review`). Record the raw feedback verbatim or as a faithful summary.
- If reviewers disagree, note the disagreement and use your own judgment — you don't have to accept every suggestion. Prefer changes that multiple reviewers flag, or that are clearly correct.
- If a reviewer was skipped (rate limit / timeout), note that under its subsection and — if the skip leaves you with zero external reviews — run the subagent fallback below to avoid proceeding with no second opinion at all.

**Fallback: subagent review (when a reviewer is rate-limited or unavailable)**

If a specific reviewer's pre-flight rate-limit check fails or it times out, fall back to a Plan subagent via the Agent tool **for that reviewer only** (the other reviewers still run as normal). For `-co` / `/codex-2nd`, the fallback subagent should be spawned with `model: opus` — Opus is the designated Claude-side stand-in for codex throughout these skills. Prompt the agent with the same review questions and point it at `$PLAN_FILE`:

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
- **Parent branch (detected current branch): `$PARENT_BRANCH`** — the new base branch will be created from this and the eventual PR will target this. **On web (see web-mode.md §5) this line inverts and the warning is suppressed:** `$PARENT_BRANCH` is the `claude/*` session branch (`$WEB_BASE`, the base), parent = `$WEB_PARENT`; do NOT fire the nested-base confirmation. Otherwise (terminal): if this looks **foreign** (not base-like — see "Base-like vs foreign parent" in Branch Context), explicitly call it out: "We are on `$PARENT_BRANCH`, which looks like a working branch, so the new `base/{impl-title-slug}` will branch off it and PR into it (nested base). Confirm this is what you want — if you meant a base branch like `main` / `develop`, switch branches and re-run." A base-like parent (`develop`, `base/*`, etc.) is the normal nested-base case — surface it but don't raise it as a concern. Do not assume `main`.
- Suggested base branch: `base/{impl-title-slug}` (parent: `$PARENT_BRANCH`)
- List of sub-tasks with dependency notes
- Source issues (if existing-issue mode)
- Review notes (present unless `-nor` skipped Step 5 — codex by default; may contain multiple reviewer subsections when flags were combined)

Ask: "Does this look right? Should I adjust anything before creating the issues?"

**Wait for confirmation before proceeding.** If the user requests changes, update `$PLAN_FILE` and re-confirm.

**`-nor` / `--no-review` override:** Skip the question and the wait. Print the same proposal as a one-shot summary so the user can see what's about to be created, then proceed straight to Step 7. The user opted in to no-confirmation mode by passing the flag.

**`-a` / `--auto` override:** Skip the question and the wait the same way — print the proposal as a one-shot summary, proceed to Step 7 — **but conditionally**. First evaluate the two pre-creation concern signals: (1) `Plan mode: design-decision` (Step 3.6), (2) `$PARENT_BRANCH` looks **foreign** (not base-like — see "Base-like vs foreign parent" in Branch Context; a base-like parent such as `develop` / `base/*` does **not** fire, so the common autonomous case proceeds silently) — also pre-confirmed (does not fire) when `-pc` / `--parent-confirmed` was passed, or on web (web-mode.md §5: the session branch is the base, not a nested parent). Signal 1 (`design-decision`) still fires on web. If **either fires**, do not auto-proceed: print one line noting why (e.g. `design-decision plan — asking for confirmation despite -a` or `parent branch \`$PARENT_BRANCH\` looks like a working branch — asking for confirmation despite -a`) and run the **normal ask-and-wait** confirm gate above. This is a soft fall-back, not a hard STOP — `-a` keeps a human in the loop precisely for the cases that need judgment, and auto-creates issues for everything else.

**`-m` / `--merge` alone does NOT skip this gate** — autonomy is `-a`'s job; `-m` only adds the merge tail to the Step 11 chain. Run the normal ask-and-wait.

**When `-a` and/or `-m` will auto-invoke the implementation skill at Step 11, say so in the proposal** (e.g. "After issue creation, implementation auto-runs in this session via /x-wt-teams; -m will merge the root PR at the end."). A user confirmation given at this gate is then an *informed* confirmation — Step 11 treats the concern signals it covered as resolved.

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
> **On web (see web-mode.md §5):** base branch = the `claude/*` session branch — write its **resolved literal** name (`git branch --show-current`), NOT `base/{slug}` and NOT the token `$WEB_BASE`. Parent = `$WEB_PARENT` (the fork-from / default branch). Write the three bullets as: base = that literal session branch; child branches merge into it; it PRs into the default branch.
- Base branch: `base/{impl-title-slug}` — all sub-issue PRs target this branch
- **Parent branch:** `$PARENT_BRANCH` (the branch this base will eventually PR into — substitute the actual branch name, e.g. `main` or `base/foo-impl`)
- Note: "Implementation will be done via `/x-wt-teams` — child branches merge into the base branch, which then merges into `$PARENT_BRANCH` as one PR" (substitute the actual parent branch name)
- **Wave plan** — list each wave with the sub-issues it contains. This shows the dependency order one `/x-wt-teams {epic-url}` session will follow (it maps to separate `--stay` sessions only if the user opts into the manual checkpoint flow in Step 11). Example: `Wave 1 (parallel): #N1, #N2, #N3, #N4` / `Wave 2 (confirm): #N5` / `Wave 3 (parallel): #N6, #N7, #N8`.
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

The `Execution mode:` and `Model:` marker lines are **mandatory** and exact-spelling matters — `/x-wt-teams` greps the body for `Execution mode:` to choose the spawn path and for `Model:` to pick each topic's model. The `Wave:` line is informational for the user (it shows the sub-issue's place in the dependency order — and which `--stay` session it would belong to if the user opts into the manual checkpoint flow); `/x-wt-teams` does not parse it. Place all three lines immediately after the `---` divider, on their own lines, in the order shown.

Then the rest of the body: what needs to be done, which files to touch, what the acceptance criteria are. Be specific enough that an agent can implement it without this planning session's context — and without this machine's local files: keep every reference portable per [Cross-machine portability](#cross-machine-portability) (`$HOME/repos/...` for other repos, images via `/gh-issue-with-imgs` or `$DROPBOX_SCREENSHOTS_DIR`, never a `$HOME/cclogs/...` log path or a machine-absolute path).

Include at the bottom:

> **On web (see web-mode.md §5):** substitute the **resolved literal** session-branch name (`git branch --show-current`, e.g. `claude/serene-galileo-7uqa3g`) for `base/{impl-title-slug}`, and the repo default branch for `$PARENT_BRANCH`. Do NOT write the token `$WEB_BASE` — `/x-wt-teams` reads this name verbatim and cannot resolve a shell variable.

```
**Base branch:** `base/{impl-title-slug}` — PR targets this branch (which itself targets `$PARENT_BRANCH`, e.g. `main` or `base/foo-impl` — substitute the actual parent name).
```

Then update the epic issue body to include the full list of sub-issue URLs (`gh issue edit {epic-number} --body "$(cat <<'EOF' ... EOF)"`).

### 9. Verify original requirements are preserved

**Skip this step entirely if `-nor` / `--no-review` was passed.** Do not spawn the verification subagent, do not write a `## Verification Report` to `$PLAN_FILE`, do not block before Step 10. Proceed directly to Step 10. The user opted out of verification by passing the flag.

**This step is critical.** We've had cases where the original requirements were lost when rearranged into epic + sub-issues. A verification subagent cross-checks the created issues against the original source.

**The verification subagent is ALWAYS Sonnet.** Reviewer flags (`-op`, `-co`) affect only the Step 5 plan review — they do **NOT** change the Step 9 verifier. Spawn a `general-purpose` agent with `model: sonnet` via the Agent tool. This is fixed by design — verification is requirement-matching against a written source, which Sonnet handles reliably and cheaply, and pinning it avoids inconsistent verification quality across reviewer-flag combinations.

The verification task is:

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

**Sonnet subagent invocation** — Agent tool call shape:

- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- `description`: `Verify issues preserve source requirements`
- `prompt`: self-contained prompt with the source, issue numbers, and the report format above

**Handling the report:**

- If **all clear** with no issues, report the verification result to the user and proceed to Step 10.
- If anything is missing/misinterpreted/ambiguous, **fix the issues directly** using `gh issue edit {number} --body "$(cat <<'EOF' ... EOF)"`. Edit the relevant sub-issue (or epic) body to include the missing requirement. Re-run the Sonnet verification on the fixed issues to confirm.
- Save the final verification report to `$PLAN_FILE` under a `## Verification Report` section.

Do not skip this step even if the plan looks obviously complete.

### 10. Cleanup audit — close source issues and any other dead resources

**Always run this step.** Hand cleanup off to `/cleanup-resources` so the audit is explicit rather than buried at end-of-workflow. The skill spawns a Sonnet subagent that re-fetches every resource and returns a structured close/keep plan; the manager (you) executes the plan and prints a final report. This catches the historical bug where source issues sometimes stayed open after a successful planning session.

Build a manifest of every issue this planning session touched, then invoke `/cleanup-resources`:

```
Skill tool: skill="cleanup-resources", args="workflow:big-plan"
```

**Manifest contents for `/big-plan`:**

- Workflow context: `workflow: big-plan`, `auto-flag: false` (planning sessions never auto-close PRs), `epic-mode: false`, `root-PR: none`, `root-PR-merged: false`, `parent-branch: $PARENT_BRANCH`.
- Issues to include:
  - **Source issues** (Step 1b) — role: `source`. The Sonnet agent should propose closing each with a "Superseded by the big-plan epic: {epic-url}" comment.
  - **The new epic** (Step 7) — role: `epic`. Agent should propose KEEP (work hasn't started yet).
  - **All new sub-issues** (Step 8) — role: `sub`. Agent should propose KEEP (each closes when its sub-PR merges, downstream).
- Branches: none — `/big-plan` does not create branches.
- PRs: none — `/big-plan` does not create PRs.
- Notes for the agent: pass the epic URL so it can reference it in supersedes comments.

After `/cleanup-resources` returns its report, surface the closed/kept counts to the user. If the report has an "Ambiguous" section, list those resources verbatim and ask the user how to handle them before moving on.

### 11. End the session

Print a summary. **The decisions table is mandatory** — never omit it. The user reviews this table to confirm or override each sub-task's execution mode, model, and wave before running `/x-wt-teams`.

**Default — one `/x-wt-teams {epic-issue-url}` invocation runs the entire plan.** `/x-wt-teams` reads the epic body, expands every sub-issue into a topic, respects each sub-issue's dependency order (so wave-N sub-issues run before wave-N+1 sub-issues), and caps concurrent children at 6 (on web: uncapped — web-mode.md §6). The "Wave" annotations are a planning aid for the human; execution sequencing is driven by the per-sub-issue `Depends on: #N1, #N2` notes and the concurrency cap.

**No planning flags get forwarded.** Print the `/x-wt-teams` line without appending `-op` or `-co`, even when the user originally invoked `/big-plan` with them. Per-sub-task models are already recorded in the sub-issue bodies, and reviewer flags for the implementation session are the user's choice (they add `-co`, etc., to `/x-wt-teams` manually when they want a reviewer on the implementation session).

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

Base branch: base/{impl-title-slug}   (on web: the claude/* session branch — see web-mode.md §5)

Cleanup audit: {N closed / M kept / K ambiguous — copy the one-line summary from /cleanup-resources}
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
- **Session-wide model** — pass `-t-op` / `-t-so` to `/x-wt-teams` to force every topic to one model (overrides every annotation).

---

This session is done. Token cost grows quadratically with session length —
start a **fresh session** and run:

  /x-wt-teams {epic-issue-url}

Recommendation depends on the **Plan mode** (recorded in the plan log per Step 3.6):

- **Goal-clear (bugfix / regression / refactor / performance / parity):** run autonomously
  end-to-end. Rely on the per-sub-issue `Depends on:` notes for dep-ordered parallel
  execution (cap 6; on web uncapped — web-mode.md §6). Add `-a` to auto-chain multi-session waves and `-m` to auto-merge
  the root PR at the end. **Do NOT recommend "checkpoint between Wave N and Wave N+1"** —
  decision points are baked in as Opus sub-tasks per Step 3.6. The user's time should
  not be the gate.

      /x-wt-teams {epic-issue-url}
      /x-wt-teams -a -m {epic-issue-url}    # fully autonomous: auto-chain waves + merge at the end

- **Design-decision (new-feature / UI variations / content structure / scoping):**
  by default these run end-to-end with one invocation too — review happens at PR
  time, same as any plan:

      /x-wt-teams {epic-issue-url}

  Only reach for manual wave checkpoints when the user genuinely needs to inspect
  each wave's artifacts and pick among alternatives *before* the next wave starts.
  That is the only case `/big-plan` ever recommends the `-s` / `--stay` flow:

  1. Close all wave-2+ sub-issues so wave 1's run only picks up wave-1 topics.
  2. `/x-wt-teams {epic-issue-url}` — **no `-s`**. This creates
     `base/{impl-title-slug}` from the parent branch and lands wave 1 on it.
  3. Review wave 1. Reopen the next wave's sub-issues.
  4. `git checkout base/{impl-title-slug}`, then `/x-wt-teams -s {epic-issue-url}`.
     `-s` reuses the branch you are currently on as the base, so wave 2 branches off
     the already-merged wave 1. Repeat steps 3–4 per remaining wave.

  **`-s` reuses the current branch as the base — never run it as the first command,
  and never from `main`** (that would land commits on `main` itself). Wave 1 is always
  the plain form; `-s` is only for wave 2+, after the base branch exists and you have
  checked it out. This block is the single source of truth for the `-s` flow — every
  other step that mentions `-s` points here.

  > **On web (see web-mode.md §5):** the session is **always** the adopt-current-branch case — the `claude/*` session branch IS the base, parent = the fork-from / default branch. No `base/{impl-title-slug}` is created and no `git checkout base/...` is needed; this reuse-current-branch semantics is the default web behavior, not an opt-in.
```

Fill in every row from the per-sub-task classifications recorded in Step 3 / Step 3.5. The table must list every sub-issue created in Step 8, sorted by Wave then by creation order within each wave. The "Reason" column is the same one-line reason already stored in the plan log and the sub-issue body markers — copy it verbatim.

Do NOT start implementing. Do NOT create the base branch. The next session (`/x-wt-teams`) handles that — **unless `-a` or `-m` was passed**, see next sub-section.

#### `-a` / `-m` — auto-invoke the implementation skill in-session

When `-a` and/or `-m` was passed on this invocation, the session does not stop after printing the summary. Always print the summary table and hand-off block first (so the log records the decisions). Then evaluate pause conditions and either pause or auto-invoke.

**Evaluate pause conditions in this order. Pause if ANY fires:**

1. **`Plan mode: design-decision`** (from Step 3.6) — design-decision plans may need human judgment mid-flow; auto-running can skip a decision only the user can make. **Does NOT fire if the user already gave an informed confirmation at the Step 6 ask-and-wait gate** (the `-a` fallback or the `-m`-alone normal gate, with the auto-invoke called out in the proposal). Otherwise print: `Paused: the plan is classified as design-decision. Run \`/x-wt-teams {epic-url}\` manually (and checkpoint between waves via the -s flow in Step 11 if you want to review artifacts).` and STOP.
2. **`$PARENT_BRANCH` looks foreign** (not base-like — see "Base-like vs foreign parent" in Branch Context) — accidental-working-branch case. A base-like parent (`main` / `develop` / `base/*` / `staging` / `release/*`) does **NOT** fire — chaining off it is the intended nested-base pattern, so the autonomous chain proceeds silently. The gate fires only when the user may have invoked `/big-plan` from an unintended working branch (`feature/*`, `fix/*`, `wip/*`, …) and the chain would commit to that nesting silently. **Also does NOT fire if the user already confirmed the parent branch at the Step 6 gate, if `-pc` / `--parent-confirmed` was passed (an orchestrating skill — e.g. `/review-loop` — invoking `/big-plan` from its own working branch and declaring it intentional), or on web (web-mode.md §5: the `claude/*` session branch is the base, not a nested parent — so this pause MUST NOT fire or the `-a`/`-m` chain dead-stops).** Otherwise print: `Paused: parent branch \`$PARENT_BRANCH\` looks like a working branch, not a base branch. Confirm you want implementation to chain off it — re-run /x-wt-teams manually, or restart /big-plan from a base branch if this was unintended.` and STOP.
3. **Step 9 verification report contained unresolved Missing / Misinterpreted / Ambiguous items.** Always evaluated — this signal cannot be pre-confirmed at Step 6 because verification hasn't run yet there. If Step 9 cleanly resolved everything via `gh issue edit`, this signal does NOT fire. Otherwise print: `Paused: Step 9 verification surfaced items that could not be auto-fixed. Resolve manually, then run /x-wt-teams.` plus the unresolved items verbatim, then STOP. (If Step 9 was skipped because `-nor` was also passed, treat this signal as not firing — the user opted out of verification entirely.)

**If no pause condition fires, auto-invoke the implementation skill via the Skill tool — first route by plan shape** (count the sub-issues created in Step 8):

**Single-sub-issue plan → `/x-as-pr`.** When Step 8 created exactly one sub-issue, the plan is single-topic, and `/x-wt-teams`'s worktree-team machinery is overkill for one topic. Invoke the lean `/x-as-pr` instead, pointed at that **sub-issue's URL** (not the epic):

- Args: `{sub-issue-url}`; forward whichever of `-a` / `-m` / `-nf` / `-nori` were passed (e.g. `-a -m {sub-issue-url}`) — each rides through independently.
- `/x-as-pr` branches off the current branch (`$PARENT_BRANCH`) and PRs directly into it, so the `base/{impl-title-slug}` indirection in the issue bodies is simply unused here (it only matters for the multi-topic merge-aggregation pattern). No explicit base arg is needed. **On web (web-mode.md §5) this inverts:** `/x-as-pr` commits on `$WEB_BASE` (the session branch) and PRs into `$WEB_PARENT` (the default branch), not the current branch — the issue body's base line encodes exactly that. The "PRs directly into the current branch" statement is terminal-only.
- `/x-as-pr -m` runs `/pr-complete -c -w` (CI + merge + delete branch + close the linked sub-issue) then `/cleanup-resources`, completing plan → impl → merge → cleanup without a human. **On web (web-mode.md §5):** the merge targets `$WEB_PARENT` and the `claude/*` session branch (`$WEB_BASE`) is NOT deleted — `/pr-complete` and `/cleanup-resources` are web-aware (they protect the session branch by name); see Parts (E). Without `-m`, the PR is left ready-but-unmerged. The post-implementation auto-fix step (auto-fix the safe `agent-found` findings before cleanup) runs by default — `-nf` skips it; `-nori` keeps findings out of GitHub issues entirely. `-a` has no extra effect inside `/x-as-pr` (it is already autonomous and single-topic) but is forwarded anyway for chain consistency.

```
Skill skill="x-as-pr" args="{-a if passed }{-m if passed }{-nf if passed }{-nori if passed }{sub-issue-url}"
```

Print above it: `Auto-invoking /x-as-pr (single-topic plan{, forwarding -a/-m/-nf/-nori as passed}).`

**Multi-sub-issue plan → `/x-wt-teams`.** When Step 8 created two or more sub-issues, invoke `/x-wt-teams` on the **epic URL**. Build the args string:

- **DO forward `-a` / `--auto` if it was passed** — `/x-wt-teams -a` auto-continues multi-wave / multi-session plans (when its Auto-Suggest detects a next wave, it invokes the next-wave command itself instead of stopping at the hand-off).
- **DO forward `-m` / `--merge` if it was passed** — `/x-wt-teams -m` merges the root PR into the parent branch when the final implementation is done (`/pr-complete` + post-merge `/watch-ci` with auto-fix on red) before cleanup. In a multi-wave chain the merge runs at chain termination, not on intermediate waves.
- **DO forward `-nf` / `--no-fix` and `-nori` / `--no-raise-issues` if they were passed** — auto-fix and issue-raising are `/x-wt-teams` defaults, so only the opt-outs change behavior downstream. `-a`, `-m`, `-nf`, and `-nori` are independent — any subset may be present (e.g. `-a -m -nf {epic-url}`).
- **Do NOT forward** `-op` / `-co` / `-nor` to the `/x-wt-teams` invocation. Per-sub-task models are already in the sub-issue bodies; reviewer flags for the implementation session are the user's separate choice. (Same rule as the plain hand-off.) `-a` / `-m` / `-nf` / `-nori` are the exceptions — they forward; the reviewer/`-nor` flags do not.

Invocation shape:

```
Skill skill="x-wt-teams" args="<args-string>"
```

Print a one-line note above the invocation so the log is readable: `Auto-invoking /x-wt-teams (forwarding {-a}{-m}{-nf}{-nori} as passed).`

**Why this exists / what it trades off:** the `-a`/`-m` auto-invoke deliberately violates the "fresh session next" principle (next sub-section) because the user has decided that the friction of restarting a session is worse than the token-cost growth of continuing in-session. Do not "fix" this by reverting to a hand-off — the auto-invoke is the entire point of these flags.

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
| Mac | `mac` | `#5319E7` (purple) | downstream `/x-as-pr` / `/x-wt-teams` handoff — see [`web/mac-handoff.md`](../../web/mac-handoff.md) |

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
# Seed the mac-handoff label so the downstream implementation skill can apply it on web.
# Canonical spec lives in web/mac-handoff.md §3 — keep this in sync (≤100 chars; GitHub rejects longer).
ensure_label "mac"  "5319E7" "Implemented in a limited env (web); final result unverified — check on Mac."
```

Apply `--label {tier}` on each `gh issue create` — epic issue: `--label epic` (Step 7); each sub-issue: `--label sub` (Step 8). The `mac` label is **not** applied at plan time — it is seeded here only so the downstream `/x-as-pr` / `/x-wt-teams` handoff can apply it (`web/mac-handoff.md`).

## Key Principles

- **Parent branch is the current branch — NOT `main`** — `/big-plan` is invoked on the branch the new feature will land on. Capture `$PARENT_BRANCH = git rev-parse --abbrev-ref HEAD` first and use it everywhere a base branch parent or PR target is needed. Do not silently assume `main`. Surface the detected `$PARENT_BRANCH` to the user in Step 6 (always show it; raise it as a concern only when it looks **foreign** — a working branch rather than a base-like branch, see "Base-like vs foreign parent" in Branch Context) so they can correct it. **On web this inverts (web-mode.md §5):** the current branch is the base (`$WEB_BASE`), parent = `$WEB_PARENT` (fork-from / default), and the foreign-parent surfacing does not fire
- **No code changes in this session** — planning and issue creation only. No branches, no commits, no pushes. **One exception:** the resource-handoff case (see "Resource handoff via a base branch" under Cross-machine portability), where this session creates `base/{slug}` + a base PR carrying `_temp-resource/{epic#}-{slug}/` for the implementer. No *product* code is written even then — only the committed resource files. **On web: commit onto `$WEB_BASE`, PR `$WEB_BASE` → `$WEB_PARENT` (deferred until the first commit) — web-mode.md §5; push only the checked-out branch**
- **One epic per plan, no exceptions** — even huge plans stay in a single epic. Scale via more sub-issues sequenced into dependency waves, not via multiple epics. A single `/x-wt-teams {epic-url}` session runs all the waves in dependency order (throttled to 6 concurrent); multi-session `--stay` is only the design-decision exception, used when the user wants to review artifacts between waves (see Step 11). Splitting into multiple epics costs more (multiple PRs to manage, manual cross-epic coordination) without saving meaningful manager-context tokens
- **Read project lessons before planning** — Step 1c auto-reads any matching `l-lessons-*` skills (written by `/retro-notes`) so previous attempts in the same area inform the plan. Skip silently if none apply
- **Save the plan log first** — before codex, before confirmation, before issues. It's the source of truth
- **Confirm before creating** — always show the plan to the user first
- **Verify after creating — always Sonnet** — Step 9 verification ALWAYS runs on a Sonnet subagent. Reviewer flags (`-op`/`-co`) shape Step 5 plan review only; they do NOT change the Step 9 verifier. Pinning verification to Sonnet keeps requirement-matching quality consistent regardless of which reviewer flags the user happened to pass
- **Cleanup audit via `/cleanup-resources` — mandatory (Step 10)** — every planning session MUST invoke `/cleanup-resources` before ending, even when no source issues were referenced. The Sonnet audit catches missed source-issue closes, surfaces ambiguous cases, and produces the paper trail of what was closed vs. kept. Skipping this step is the historical bug where completed source issues stayed open — do not relitigate that decision case-by-case
- **Annotate execution mode per sub-task — mandatory** — every sub-task MUST be classified as `subagents` (default) or `teams` based on whether it needs mid-flight inter-agent communication. The annotation lives in the plan log, the created sub-issue body, AND the final summary table (Step 11). `/x-wt-teams` reads it per topic to choose how to spawn children. Default to subagents; only mark `teams` when a sub-task genuinely depends on another child's mid-task output
- **Annotate model per sub-task — mandatory** — every sub-task MUST be classified `sonnet` (default), `opus`, or `haiku` based on the kind of work. The annotation lives next to the execution-mode line in the plan log, the sub-issue body, AND the final summary table (Step 11). `/x-wt-teams` reads it per topic and spawns each child with the matching model. A manual `-t-op` / `-t-so` flag on `/x-wt-teams` overrides every topic's annotation as a session-wide manual override (the `-op` / `-so` / `-haiku` flags on `/x-wt-teams` are reviewer flags, not team-member overrides — they do NOT affect child models). **Default `sonnet` when in doubt** — `/big-plan` already settled the hard decisions; most sub-tasks are mechanical implementation. Pick `opus` (Opus 4.8, Anthropic's top model, running with a 1M-token context window) when the deliverable benefits from top-model quality: high-quality Japanese-language writing, creative UI design, pattern-generation / visual-creative algorithms (e.g., pgen patterns or GLSL shaders), or genuinely difficult reasoning-heavy work. `haiku` is rare
- **Annotate wave per sub-task — mandatory** — every sub-task MUST carry a `Wave:` number reflecting its position in the dependency chain (see Step 3.5). Wave size respects `/x-wt-teams`'s 6-concurrent-agent cap. Insert dedicated "confirm" sub-issues at risky cross-phase boundaries (e.g., between backend and frontend waves) rather than splitting into multiple epics. Wave annotation lives in the plan log, the sub-issue body, AND the final summary table
- **Final summary table is mandatory** — Step 11 MUST include the per-sub-task decisions table showing `Wave`, `Mode`, and `Model` for every sub-task, with the one-line reason. The user reviews this table to confirm or override decisions before running `/x-wt-teams`. Never omit it — even when the plan looks obvious, the user needs the table to spot mistakes and override
- **Planning flags do NOT forward to the hand-off** — `-op`/`-co` shape only the planning session itself (which reviewer(s) critique the plan and verify the issues). The Step 11 hand-off MUST print the `/x-wt-teams` line in plain `/x-wt-teams {url}` form with no flags appended, even when the user originally invoked `/big-plan` with those flags. Per-sub-task models are already recorded in the issue bodies (Step 8 markers); reviewer flags for the implementation session are the user's choice and are added to `/x-wt-teams` manually. The split keeps planning concerns and implementation concerns from leaking into each other
- **Small issues win** — an issue that takes 15 agent exchanges is better than one that takes 50
- **Self-contained sub-issues** — each issue body must be readable standalone, without needing this session's context
- **Fresh session next** — always end by instructing the user to start a new session and run `/x-wt-teams {epic-url}`. Wave ordering is encoded in dependency markers; `/x-wt-teams` honors them within a single session, so one invocation typically handles the whole plan. Manual per-wave checkpointing via `--stay` is documented as an exception, not the default. **Exception: `-a` / `-m`** — when either flag is set the user has explicitly opted out of the fresh-session principle; auto-invoke the implementation skill (`/x-wt-teams` for a multi-sub-issue plan, `/x-as-pr` for a single-sub-issue plan) via the Skill tool from this same session per Step 11's `-a`/`-m` sub-section, after checking the documented pause conditions (design-decision mode, foreign-looking parent branch unless `-pc`, unresolved Step 9 findings). Reviewer flags from this session are still NOT forwarded
- **`-a` / `--auto` is the autonomy flag; `-m` / `--merge` is the merge flag — both trigger the in-session chain; they are orthogonal** — `-a` skips the Step 6 confirmation wait and auto-creates the issues, but falls back to ask-and-wait when a pre-creation concern signal fires (`Plan mode: design-decision`, or `$PARENT_BRANCH` looks **foreign** — a working branch, not a base-like one such as `main` / `develop` / `base/*` — without `-pc` / `--parent-confirmed`); the Step 5 review and Step 9 verification quality gates still run (that's what separates `-a` from `-nor`). `-m` keeps the Step 6 confirmation but adds the merge tail downstream. Either flag makes Step 11 auto-invoke the implementation skill — `/x-wt-teams {flags} {epic-url}` for a multi-sub-issue plan, or `/x-as-pr {flags} {sub-issue-url}` for a single-sub-issue plan — forwarding whichever of `-a` / `-m` / `-nf` / `-nori` were passed. Downstream: `-a` auto-chains multi-wave plans, `-m` merges the final PR (CI + merge + cleanup + post-merge CI watch); auto-fixing the safe `agent-found` findings before cleanup is the downstream default (`-nf` skips it, `-nori` suppresses raising the findings at all). All flags are independent; full hands-off plan → impl → merge → cleanup is `-a -m`. The reviewer / `-nor` flags still do NOT forward
- **Classify the plan as goal-clear or design-decision — mandatory (Step 3.6)** — every plan MUST be classified before Step 4 saves the log. Record `**Plan mode:** goal-clear` or `design-decision` in the plan log header. For **goal-clear plans** (bugfix / regression / refactor / performance / parity / migration — the success criterion is unambiguous), **NEVER recommend "checkpoint after Wave N" in the Step 11 hand-off** — the user's time is a real cost and inter-wave human pauses are anti-leverage when the goal is clear. Instead, **bake every would-be-checkpoint decision into a dedicated `model: opus` sub-task** that reads the upstream artifact, picks among alternatives, and edits the downstream sub-issue's body via `gh issue edit` to lock in the concrete spec. Goal-clear plans are designed to run end-to-end under `/x-wt-teams` (with `-a` auto-chaining any multi-session waves) with no human in the loop until verification. For **design-decision plans** (new features / UI variations / content structure / scoping — the success criterion depends on user preference) human checkpoints between waves are appropriate when the user wants to review artifacts; the Step 11 hand-off still defaults to the one-shot `/x-wt-teams {epic-url}` and documents the manual `-s` checkpoint flow (wave 1 plain → `git checkout base/{slug}` → `-s` for wave 2+) as the option for those
- **Issues must be portable across machines (Cross-machine portability)** — implementation often runs on a different machine (via `/x-wt-teams`) that shares the repo layout. cclogs is Dropbox-synced now, but sync lag and discoverability make it the wrong handoff surface, so the GitHub issue is still the artifact you design for: every implementer-facing reference in it must survive the move — other repos as `$HOME/repos/...` (never machine-absolute or `/mnt/c/Users/...`), the *distilled* implementer-facing spec in the issue body or a comment (never a full conversation log or large raw dump — that leaks on a public repo and bloats the issue; keep raw logs in the Dropbox cclogs dir, never in any issue and never via the `$HOME/cclogs/...` log path), and images / prototypes via `/gh-issue-with-imgs`, the Dropbox cclogs dir (`$DROPBOX_CCLOGS_DIR/...`), or `$DROPBOX_SCREENSHOTS_DIR`
- **No `~` in paths** — always use `$HOME`
