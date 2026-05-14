---
name: prototype-first-wisdom
description: >-
  Solve a complex bug or design problem by building a tiny isolated prototype first, instead of
  patching the production system in place. Trigger PROACTIVELY when (1) the same bug has resisted 2+
  in-place fix attempts (fail-retry loop), (2) the user mentions "minimal prototype", "from zero",
  "from scratch", "simple script", "sandbox", "standalone", "isolate", "play around", or "try a
  sandbox version", (3) you find yourself ranking a list of suspects and ruling them out via
  source-grep on a runtime/visual bug, (4) the user is brainstorming many design options for a UI
  surface and wants speed (e.g., "make 20 patterns of the top page"), (5) the next reasonable step
  would be "instrument the existing complex code" — pause and consider this skill instead. Build the
  prototype in `__inbox/<descriptive-name>/` in the project root, matching the project's tech stack
  (HTML+CSS+vanilla JS for static sites, Vite+React for React apps, Node script for CLI/utility
  logic). Don't commit it — its value is the learning, not the artifact. **Variant for repeated
  regression cycles (8+ in-place fixes on the same bug class):** keep the prototype as a committed
  sub-package named `packages/prototype-<topic>/` — see the "Variant: project-level reference
  prototype" section below.
---

# Prototype-First Wisdom

When work is genuinely complex — a bug that won't die after multiple in-place fixes, a UI surface with too many design options, an investigation that keeps coming back wrong — the right move is **not** to add another patch on top of the entangled production code. Build the simplest possible thing that exhibits the same problem (or the simplest version of the design space), confirm it works in isolation, then bring the learning back to production.

This skill captures a pattern Takazudo has used twice with strong results — the bezier-tool dev (kept failing in place until a from-scratch prototype landed it) and the 20-design-patterns brainstorm (huge time fixing a built site vs. dramatically faster making 20 fresh layouts). It also fits any situation where source-grep ruling-out is failing on a runtime bug.

## When to invoke

Invoke proactively in any of these:

1. **Fail-retry loop** — the same bug has been "fixed" 2+ times and the user reports it still happens. Stop attempting in-place fixes; switch methodology.
2. **Source-grep ruling-out trap** — you're ranking suspects from an issue body and ruling them out by reading code. The visible bug is precisely the one source-grep can't see, otherwise it would have been pre-fixed.
3. **User signals it explicitly** — "minimal prototype", "from zero", "from scratch", "simple script that simulates the same thing", "sandbox version", "let's just try in isolation", "play around with it first".
4. **Multi-component entanglement** — a bug spans state machines, async boundaries, refs, effects, and rendering pipelines and you can't confidently say where the broken value is born.
5. **UI / design brainstorming with many options** — user wants N layouts / variants / themes. Build them as fresh standalone HTML files; don't graft them into the production app.

When in doubt: if the next reasonable step would be "instrument the existing complex code with console.log and grep", consider whether building the smallest reproduction outside the app would converge faster.

## How to apply

### 1. Pick a location: `__inbox/<descriptive-name>/`

Always work under `__inbox/` in the project root. This directory is for ephemeral try-and-error work and should be (or become) gitignored.

```bash
mkdir -p __inbox/<descriptive-name>
```

If the project's `.gitignore` doesn't already ignore `__inbox/`, add the line — see "Gitignore check" below.

Use a name that's specific to the task: `__inbox/repro-image-drift/`, `__inbox/top-page-layouts/`, `__inbox/bezier-pen-math/`. Future-you will thank present-you.

### 2. Pick a tech stack matching the project

The prototype should match the production project's tech stack closely enough that the learning transfers, but not so closely that you re-import all the entanglement.

| Project type | Prototype form |
|---|---|
| Static site / vanilla web | `index.html` + `style.css` + `script.js` — open in a browser |
| React + Vite app | A new mini Vite app in `__inbox/<name>/` (`pnpm create vite`), or a single `.html` with React via CDN if you want to skip the build step |
| Next.js app | Same as React+Vite — Vite playground is faster than booting another Next.js project |
| Node CLI / utility | A standalone `.mjs` script — `node __inbox/<name>/repro.mjs` |
| Backend handler / API logic | A standalone `.mjs` that imports the production function and calls it with hard-coded inputs |
| Canvas / visual | HTML + canvas + script. If the production app uses React, you can skip React in the prototype if the bug is in the canvas layer itself |
| GLSL / shader | A single `.html` with the shader inline + a uniform-tweaking UI |

The rule of thumb: **match the part of the stack that touches the bug, drop everything else**. If the bug is in coord-conversion math, your prototype only needs the math. If the bug is in React render timing, your prototype needs React + a minimal component but no router / no global state / no external services.

### 3. Build the smallest thing that reproduces (or that explores)

For bugs:

- Hard-code the inputs that match the user's repro (positions, sizes, sequences of events).
- Import the actual production function(s) from the project workspace if possible — don't reimplement them. The point is to prove the production function is right or wrong, not to write a parallel implementation.
- Log every intermediate value to stdout (Node) or `console.log` (browser).
- Assert the expected output. The prototype should **fail** initially — that's the proof that it captures the bug.

For design exploration:

- Build N variants as fresh standalone HTML pages, one per layout idea. Don't try to make the production app render N variants.
- Strip out auth, data fetching, business logic, design system constraints — keep what's needed for layout judgment.

### 4. Run it and read the output

For Node: `node __inbox/<name>/repro.mjs`. Read stdout.
For HTML/Vite: open in a browser, read DevTools console + visual.

If the prototype reproduces the bug → root cause is in what you imported (the production functions). Move to instrumenting the prototype, not production. Iteration is now fast.

If the prototype's output is correct → bug is **not** in the imported layer; it's in the production orchestration around it (state machinery, refs, effects, paint pipeline). Escalate: extend the prototype to include the next layer of complexity, or build a component-level test that exercises the orchestration.

For design exploration: pick the variants that work, port the chosen patterns to production. Discard the rest.

### 5. Apply the learning to production

Once the prototype tells you what's wrong:

- Make the production fix at the identified line.
- Add a regression test (Vitest unit test, component test, or Playwright e2e — whichever matches the bug surface).
- The prototype itself does **not** need to be added to the test suite. Its value was the diagnostic.

### 6. Don't commit the prototype

`__inbox/` should be gitignored. The prototype is throwaway — its value is the learning it produced, not the artifact.

If the user explicitly asks to keep it, fine — move it out of `__inbox/` to a permanent location and commit that. But default to **don't commit**.

### 7. Note the prototype location in your final report

When you finish the work and report back to the user, mention where the prototype lives in case they want to look. Example: "Prototype that reproduced the bug: `__inbox/repro-image-drift/repro.mjs`."

## Gitignore check

Before creating `__inbox/<name>/`, ensure `__inbox/` is gitignored. If the project has a CLAUDE.md or contributor guide, it likely already documents this convention. Otherwise:

```bash
grep -Fxq "__inbox/" .gitignore 2>/dev/null || echo "__inbox/" >> .gitignore
```

For projects that don't already use `__inbox/`, double-check with the user before adding it to `.gitignore` — some projects use a different ephemeral-scratch convention (`tmp/`, `scratch/`, `.local/`).

## Why this works

- **Less context = faster iteration.** A 50-line script with stdout logging converges faster than instrumenting a 3000-line component.
- **No entanglement = clearer signal.** When a fix in production "works" but a side effect breaks something else, you spend hours unwinding which is which. A standalone prototype has nothing else to break.
- **Forces honest reproduction.** "I think the bug is X" loses to "here is a script that fails when I run it." The prototype either fails or it doesn't.
- **Reusable as the regression test's blueprint.** Once the prototype fails-then-passes, the same input/output pair makes a great Vitest test.

## Variant: project-level reference prototype as `packages/prototype-<topic>/`

The default pattern is throwaway — build under `__inbox/`, don't commit, learning lives in your head and in the production fix. But there is one case where the prototype should be **kept as a committed sub-package**:

**Trigger:** the same bug class has resisted **many** (typically 8+) in-place fix cycles. Each cycle ships CI-green, each cycle's reviewer can't see the bug from source alone, each cycle's user can. At that point, the throwaway pattern is no longer enough — you need a permanent canonical reference that future waves of diagnosis can diff production against.

This is a **second-order escalation**. Default to throwaway. Only escalate to a sub-package prototype when the throwaway approach has itself failed to break the cycle (i.e., you tried in-place fixes, you tried throwaway prototypes, and the bug class keeps coming back).

### Where to put it

In a monorepo / workspace project: `packages/prototype-<topic>/`. The `packages/prototype-` prefix is the convention — it makes the directory's purpose immediately obvious to anyone scanning the repo: this is a prototype, not production, not a library.

Examples:

- `packages/prototype-canvas/` — for a canvas pan/zoom + coordinate-system bug class
- `packages/prototype-clipping/` — if a follow-up bug isolates to rect clipping on top of canvas
- `packages/prototype-undo-redo/` — for an undo-state-divergence bug class

Each prototype proves **exactly one axis** of the production system's complexity. When production is found to deviate from the prototype's behavior on that axis, you've localized the bug.

### Tech stack and structure

Match the production app's tech (Vite + React for a React app, plain HTML+canvas if the production app's bug lives in the canvas layer below React, etc.). Include:

- A `coordinate-model.md` (or equivalent spec doc) that names the canonical invariants this prototype proves. Future planning agents read this to understand "what does this prototype claim to be true?"
- Exhaustive unit tests (vitest) for the pure-function math at the prototype's core.
- A standalone interactive demo (Vite dev server at a unique port) so the user can sanity-check by clicking.
- A Playwright spec as the regression contract (does not need to run on CI — see below).

### Do NOT auto-deploy prototypes to CI

By default, prototype demos **stay local-only** — `pnpm <prototype>:dev` runs them when someone wants to inspect, and that's enough. Don't wire them into CI preview deploys, don't add them to `pr-checks.yml`'s deploy table, don't waste CI minutes building them on every PR.

The exceptions:

1. **The user explicitly asks for a CI preview** — e.g., "deploy it to PR previews at `/canvas-fix-app/` so I can check it on each iteration." Honor the request.
2. **The prototype is being used as the active diagnosis ground truth for an in-progress wave** — the team needs to point reviewers at a live URL on every PR. Deploy only for the wave's duration; revert when the wave is done.

When in doubt: don't deploy. Adding a CI deploy is cheap; reverting one quietly is harder.

### Commit the prototype

Unlike the `__inbox/` variant, this prototype is part of the codebase. It is committed, lives at HEAD, and is maintained as production migrates to match its invariants. Future waves (diagnosis, fixes, confirm walks) read it as the canonical reference.

When all bug-class waves are complete and production has structurally adopted the prototype's model, the prototype can either (a) stay as a permanent regression-test playground, or (b) be removed if its invariants are now enforced by production tests. Default to (a) until the user says otherwise.

### Pattern signal in agent prompts

When this skill triggers and the project shows the high-cycle escalation signal (8+ cycles, monorepo, `l-lessons-*` skill with a "this bug class is back" entry), build the sub-package prototype. When in doubt, ask the user — single-cycle throwaway is the safer default; over-engineering a permanent prototype for a bug class you've only seen once wastes effort.

## What this is NOT

- Not "rewrite the production code from scratch" — the prototype is a diagnostic, not a replacement.
- Not a substitute for browser verification on UI bugs — browser verification (`/headless-browser` / `/verify-ui`) still catches things stdout can't (computed style, paint pipeline, real RAF). Prototype-first works **with** browser-first, not instead of it.
- Not always the right move — for a typo, a config bump, a single-file refactor, or any bug whose root cause is obvious from one read, just fix it. This skill is for the case where "just fix it" has already failed once or twice.

## Examples

### Example 1: bezier tool dev (Takazudo's prior experience)

Tried fixing in place repeatedly; geometry kept being wrong. Built a from-scratch minimal bezier-pen prototype as standalone HTML+canvas+JS in `__inbox/`. Got the math right in isolation. Brought the corrected math back to production. Bug landed.

### Example 2: 20-page-layout brainstorm (Takazudo's prior experience)

User asked for 20 top-page design variants on a built website. Trying to make the live site render 20 variants would have been huge time. Instead made 20 fresh standalone HTML files, each its own design. Much faster, user picked the winners, those got ported to production.

### Example 3: composer image-position drift (the reason this skill exists)

PR-1530 then PR-1537 both shipped fixes that didn't actually fix the user-visible bug because the diagnosis was source-grep-based. Round-2 plan switched to: build a Node script under `__inbox/repro-1533-r2/` that calls the production conversion functions with hard-coded user-repro inputs, logs intermediates, asserts the expected transform. Either the script reproduces the bug (math is wrong → fix the math) or it doesn't (math is innocent → escalate to component-level test for orchestration).

## Quick decision

Ask: **"If I imagine running a 50-line script that hard-codes the inputs and calls the production function — would that script fail?"**

- Yes / probably / I'm not sure → build the prototype. You'll know within minutes.
- No (the bug is genuinely outside the function layer — a real-browser render race, a CSS computed-style fallback, a network race) → use `/headless-browser` or component-level test instead. Prototype-first won't help; verification-first will.
