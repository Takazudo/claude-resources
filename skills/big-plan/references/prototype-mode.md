# Prototype Mode (`-pr` / `--prototype`) — the full procedure

Read this file **before** running a `-pr` session; do not run the loop from memory. The summary in
`SKILL.md` → [Prototype Mode](../SKILL.md#prototype-mode-pr---prototype) gives the contract; this
file gives the mechanics.

`-pr` puts a **UI prototyping loop in front of the plan**. The session builds throwaway rough UIs,
shows them, takes the user's feedback, iterates — and only then decomposes into an epic and
sub-issues, with the settled direction as the spec. It is the merge of a sequence the user
previously ran by hand: `/protodev` → feedback → repeat → `/big-plan`.

**This file adds the UI-rough loop and the planning hand-off on top of `/protodev`;
it does not replace it.** That skill still owns *why* a prototype beats patching in place, where a
prototype lives, and how to pick a stack that matches the project — read it for those. What is
here is everything the by-hand version left to improvisation: the round structure, the feedback
checkpoint, and how the chosen variant becomes a plan.

**Borrow those skills' techniques, never their end-to-end flow.** `/protodev` ends by
applying the learning to production code and adding a regression test; `/design-polish-iteration` commits
each accepted polish round to the live page. Neither may happen here — this is a planning session,
and the only files it may write are prototype artifacts (plus the resource bake in §9). Read them
for judgment, run this file for procedure.

## 0. Does the flag apply at all?

`-pr` is for work with a **visual surface to judge**. If the request has none (a refactor, a CI
fix, a schema migration, a backend contract), say so in one line — "`-pr` doesn't apply here,
there's no UI surface to prototype; planning normally" — then skip the loop **and everything it
would have triggered**: no prototype dir, no checkpoint, and no implicit resource bake (§9). An
explicitly typed `-br` keeps its own independent meaning. Do not invent a UI to satisfy the flag,
and do not stop to ask.

**Under a sweep (`-is` / `-isask`) the flag applies per issue, not to the batch.** The sweep marks
which handled issues need a UI direction settled and runs ONE shared loop over just those — same
mechanics as this file, with the shape changes in [`issue-sweep.md`](issue-sweep.md) Step 3p (one
proto dir and foundation for the sweep, a subdir per issue, one checkpoint per round covering every
open issue, per-issue acceptance and cap, and a bake that rides each child epic's own base). Read
that step alongside this file; where they differ, Step 3p wins.

Two sub-modes, selected by **intent — what kind of answer the user is asking for** — not by
whether a surface happens to exist today:

| Sub-mode | The ask | Round-1 spread |
| --- | --- | --- |
| **brainstorm** | *Alternative directions.* "new feature UI", "rough ideas for X", "make 20 patterns of the top page", "this page needs a different answer, not a tweak" — including a radical redesign of a surface that already renders | wide — roughly **8–20** variants, deliberately spanning different *concepts*, not tweaks of one |
| **polish** | *Refinement within a direction that is already settled.* The layout is right and the complaint is that it looks flat / dated / cramped / unfinished | narrow — roughly **3–6** variants, each built from the captured baseline |

An existing surface does **not** imply polish: the user's own 20-layout precedent was a wholesale
rethink of a built website, and treating it as polish would have produced 20 near-identical pages.
When the request names a count ("make 20 patterns"), that count wins. Otherwise pick from the
table and say which sub-mode you picked and why. A brainstorm round whose variants differ only in
spacing and color has failed — spread means *different answers to the same question*.

## 1. Where the prototype lives

Per `/protodev`, the repo-scoped Dropbox cclogs dir:

```bash
PROTO_DIR="$(node "$HOME/.claude/scripts/get-logdir.js")/<descriptive-slug>"
mkdir -p "$PROTO_DIR"
```

Outside the repo, so nothing to gitignore and nothing dirties the working tree. Use a name
specific to the task — `top-page-views`, `dashboard-redesign`, `intro-block-patterns` — not
`proto/`.

**Exception — in-repo `__inbox/<slug>/`:** only when the prototype must import the repo's
production code or ride its workspace/Vite tooling so relative imports resolve. A UI rough almost
never needs this; it mocks the data.

**On web (`$CLAUDE_CODE_REMOTE=true`) — `-pr` runs, but three things change.** Do not inherit the
terminal instructions silently; state each degradation in the round's message.

1. **Storage.** cclogs is the ephemeral `/tmp` stub, so nothing left there survives the container.
   The loop itself still runs there — it only has to outlive the round, and the whole exploration
   must never be committed (§9, §11). What changes is the bake: it is **not skipped and not
   early** — run §9's bake as written, copying only the **chosen** variant into
   `_temp-resource/{epic#}-{slug}/`, but commit it onto the `$WEB_BASE` session branch instead of
   creating `base/{impl-title-slug}` (web-mode.md §5 — there is no `base/{slug}` on web). Say
   plainly in the round message that an exploration lost to a reclaimed container is gone, exactly
   like the plan log before its Step 11 epic comment.
2. **Screenshots.** Capture with whatever browser tooling the container has. If none is available,
   say so plainly, present the variant files and the served pages for the user to open themselves,
   and **still hold the checkpoint** — a capture you could not run is never a reason to skip the
   human reaction.
3. **Embedding.** The release-asset upload helper needs `gh`, which web lacks (web-mode.md §1).
   Commit the chosen variant's shots under `_temp-resource/{epic#}-{slug}/shots/` as part of the
   §9 bake and reference those in-repo paths from the issues — GitHub renders committed PNGs, and
   the files are on the branch by then.

## 2. Round 0 — write the brief before writing any page

Write `$PROTO_DIR/BRIEF.md` first and keep it current across rounds. It is what makes N variants
comparable instead of N unrelated pages, and it is what a fan-out of parallel variant agents reads
as its shared contract. It must carry:

- **Goal** — the problem in 2–4 sentences. What is hidden / broken / missing, and for whom.
- **One idea per page** — each variant prototypes exactly one answer, named in its filename.
- **Shared foundation** — which files every page links (`shared.css`, `shared.js`, or `_shared/`),
  and the exact call that injects the app chrome (see next section).
- **The data source** — the fixed catalog / fixture every page renders. Naming it stops each
  variant inventing its own content, which destroys comparability.
- **Interaction bar** — the core interaction of the idea must actually *work* in vanilla JS
  (hover, click, typing, keyboard). A static picture of an interaction is not a prototype of it.
- **Constraints** — no frameworks, no external assets, no network; draw mini-illustrations in
  CSS/SVG; keep each page self-contained and readable (≲400 lines); page-local `<style>` only,
  never edit the shared files.
- **Copy rules** — which language the UI chrome is in vs. explanatory text, and any house rules
  (e.g. no em dashes in UI copy, keep labels short).
- **Mock vs production** — state plainly that tokens/CSS here are a mock lifted for looks and are
  **not** a spec for pixels; production follows the real design system.

## 3. Round 0 — build the shared foundation once

Every observed prototype set that worked has a mock foundation the variants share, so each page
authors only the part that differs:

- `shared.css` — mock tokens, copied from the production token file so light/dark and the palette
  match reality. Say in a comment where they were copied from.
- `shared.js` — the app chrome as an injectable shell (`document.body.innerHTML = APP.shell({...})`),
  the fixture catalog, a few inline SVG icons, and a `protoNote(title, oneLiner)` helper each page
  calls at the end so the gallery and the screenshots are self-labelling.
- A **state toggle** where the surface has one that changes the design question — signed-out vs
  signed-in, empty vs full, pending vs clean, light vs dark. Put it in a fixed corner panel and
  make it URL-addressable (`?auth=1`) so the screenshot script can drive it.

Build this before the variants, not alongside them. Variants generated against a half-built
foundation diverge and stop being comparable.

## 4. Generate the variants

One standalone file per variant: `01-picker-preview-pane.html`, `b-strip-and-tabs.html` — the
number or letter orders the gallery, the words say what the idea is. Plus `index.html`: a gallery
of concept cards linking each variant, with a comparison table naming each idea's trade-off.

**Fan out.** A round is 8–20 independent pages against a written brief — embarrassingly parallel.
Use the **Workflow tool** to generate them, one agent per variant. (`SKILL.md` instructing this
call *is* the opt-in; the user never types "workflow".) A round of 3–6 polish variants does not
need a fan-out — generate them directly.

**Write ownership is strict, or the round corrupts itself.** You (the parent) build the shared
foundation *before* the fan-out, write `index.html` *after* it, and run the capture. Each child
owns **exactly one** variant file and writes nothing else — not the shared files, not the gallery,
not another variant. A child that needs something from the shared foundation reports it back
instead of editing it; you apply the change centrally and say which variants were regenerated
against it.

Give every variant agent: the brief path, the shared-foundation paths (read-only), its own
filename, its one idea in a sentence, and that write-ownership rule stated explicitly.

## 5. Capture, and look at what you captured

Serve the dir on the **first free port from 4799 up** — never a hardcoded one. A second `-pr`
session, or your own server left over from an earlier round, already holds 4799; `http.server`
then exits with `Address already in use`, the `&` swallows it, and the gallery URL you hand the
user serves *the other session's* prototypes. Run it detached (Bash `run_in_background`, or the
redirect below — a bare `&` with an open stdout hangs the tool call), and record the port you got.

**Bind `0.0.0.0` and advertise the tailnet address, never `localhost`.** The user typically views
the gallery from a different machine than the one running the session, so a loopback-only server
hands them a dead link. `serve-host.sh` resolves the Tailscale IP (falling back to the LAN IP, then
`127.0.0.1`):

```bash
PROTO_PORT=4799
while lsof -ti :$PROTO_PORT >/dev/null 2>&1; do PROTO_PORT=$((PROTO_PORT+1)); done
PROTO_HOST=$(bash "$HOME/.claude/scripts/serve-host.sh")
(cd "$PROTO_DIR" && nohup python3 -m http.server "$PROTO_PORT" --bind 0.0.0.0 >/dev/null 2>&1 &)
echo "gallery: http://$PROTO_HOST:$PROTO_PORT/index.html"
```

A dev server instead of `http.server` needs the same treatment — `vite --host 0.0.0.0`, and print
the `$PROTO_HOST` URL rather than whatever loopback URL the tool banners. Screenshot tooling on
this machine can keep using `127.0.0.1:$PROTO_PORT`; only the URL handed to the user must be the
tailnet one.

Kill it when the loop exits (`lsof -ti :$PROTO_PORT | xargs kill`) — an orphan server outlives the
session and is what the *next* run collides with. (Probe-and-walk-forward rather than kill-the-port
is the house convention; `/dev-package-json` (port rotation) is the same pattern as a project dev script,
including its accepted TOCTOU caveat.)

Screenshot every variant at the breakpoints the surface actually has (~390 / ~760 / ~1300px), in
each state the toggle exposes, on **worst-case content** — longest title, longest list, near-empty
group — not the page top. Use `/headless-browser` for a one-off pass; for a set you will re-shoot
every round, write a small `shoot.mjs` in the dir (Playwright element screenshots of each `.frame`
→ `shots/`) so re-capture is one command. **A hand-written `shoot.mjs` is not guarded for you** —
the machine-wide serialization is automatic only inside `/headless-browser` and `/verify-ui`, so
launch yours through the semaphore explicitly:

```bash
bash "$HOME/.claude/scripts/playwright-guard.sh" --wait 300 -- node shoot.mjs
```

On guard exit 75 another session holds the slot; wait and retry, never bypass it.

**Then read every PNG yourself before showing anything.** This is not optional and it is not
politeness: a variant that rendered blank, overflowed, or lost its layout looks fine in the file
listing and wastes a whole feedback round. Judging from the pixels rather than from the source you
just wrote is the core discipline of `/design-polish-iteration` — read it if the judgment gets
hard. Drop or fix broken variants before the checkpoint and say which you dropped.

## 6. The feedback checkpoint — the point of the flag

Present the round and **stop for the user's reaction**:

- the gallery URL (`http://$PROTO_HOST:$PROTO_PORT/index.html` — the tailnet host and the
  port §5 actually bound, never `localhost`) so
  they can click through the real, interactive pages,
- the screenshots, attached, so they can judge without serving anything,
- a short line per variant: what the idea is and the trade-off it takes,
- and an explicit ask — which ones live, which die, what to merge, what is missing.

**No flag suppresses this checkpoint — not `-a`, not `-nor`, not `-po`.** Prototyping with no
human reaction is pointless, and the checkpoint is the flag's only reason to exist; suppressing it
would leave `-pr` doing nothing. Same rule, same reason, as the `-isask` interview, and it is
written into `SKILL.md`'s [Auto autonomy contract](../SKILL.md#auto-autonomy-contract) as an
explicit carve-out so it does not read as an agent-initiated pause. `-nor` drops the *planning*
gates (Step 5 review, Step 6 proposal, Step 9 verification); it has no authority over this one.
Everything *after* the direction is accepted runs exactly as autonomously as any other `-a` chain.

## 7. Iterate, then exit

Each further round goes in its own subdir — `$PROTO_DIR/round2/`, `round3/` — carrying the
survivors plus whatever the feedback asked for. Keep the earlier round on disk: "go back to how 7
did it" is a normal thing for the user to say.

**Only the user's explicit acceptance ends the loop** — they name a winner, a merge of variants, or
"this one but with 4's sidebar". Nothing else counts as acceptance: not a round you are pleased
with, not silence, not the round cap. Exit the moment acceptance arrives; do not run another round
for symmetry. Conversely, stop and say so if a round closes no gap — that is a signal the question
is wrong, not that more variants are needed.

**Cap at 5 rounds, and reaching the cap is not acceptance.** At the cap, save the state (the dir is
already on disk — say where, and which variants are still live), then **ask** which of three the
user wants:

- **continue** — keep iterating past the cap,
- **defer** — end the session here with no plan; the prototypes stay in cclogs for later,
- **select** — proceed to planning with the two or three live candidates carried in as a `fable`
  decision sub-task (Step 3.6's shape) that picks between them from the upstream artifact.

Never pick for them, and never let the cap silently become "select".

## 8. Polish sub-mode — the extras

When the surface already renders, the loop starts one step earlier and gains one option:

1. **Capture the baseline first.** Screenshot the live page at every breakpoint before building
   anything. It is both the before-shot and the input to step 2.
2. **North-star direction — opt-in, and it costs real money.** A model handed the existing source
   over-anchors on it, and "polish" collapses back into the original. Generating a polished mockup
   *from the screenshot* breaks that anchor. Use `/codex-imagegen` with the baseline as input, one
   call per direction, varying the brief ("editorial / high-contrast", "calm / airy", "denser /
   utilitarian"). Each call is roughly **90k–230k ChatGPT tokens** of the user's quota, so it runs
   **only on their explicit request, or when they accept an offer you make at a plateau** — "rounds
   2 and 3 closed no gap; want me to generate 2 north-star mockups (paid ChatGPT usage) for a fresh
   direction?". `-a` does **not** supply that consent, and a plateau on its own is not consent
   either. Generate directions once up front, never per round. A reference image the user supplies
   replaces this step entirely and costs nothing.
3. **The mockup is direction, not spec.** It hallucinates copy, numbers, and components, and it
   cannot be traced to code. Take mood, hierarchy, spacing rhythm, palette, and treatment from it;
   take the real content from the live page. Never reproduce its invented rows.
4. **Stay on the token scale.** Diagnose gaps as moves on the project's own scale — "cards read
   flat → raise elevation one step, tighten in-card gaps, widen between-card gap" — not as
   arbitrary values. `/css-wisdom`'s tight-token strategy is the framework; an arbitrary `#hex` or
   `13px` added to "match the mockup" is a regression even when it looks closer.
5. **Measure what the eye can't.** Color and near-threshold values go to `/verify-ui` (sample
   computed styles) rather than to judgment.

The in-place variant of this — polish a live page with no plan at the end — is
`/design-polish-iteration`. Reach for that when nothing needs decomposing; reach for `-pr` when the
result has to become an epic.

## 9. Hand the settled prototype to the plan

The chosen variant is now the **spec** — but "spec" has a precise authority order, because the
prototype is authoritative about some things and actively misleading about others. State this order
in every issue that references it, and follow it yourself when writing acceptance criteria:

1. **The accepted written requirements govern behaviour.** What the user agreed to at the
   checkpoint, written out, is the top authority.
2. **The project's design system governs styling.** Real tokens, real components. The mock's
   values were lifted for looks and are not a spec for pixels.
3. **The prototype's markup / CSS / JS illustrates the chosen structure and interaction.** Port the
   layout and the behaviour; do not port the values.
4. **Any deliberately exact visual requirement is called out separately**, by name, in the issue —
   "this spacing/ratio/animation *is* the requirement". Anything not called out is illustration.

Three channels carry it to the implementer. They are not alternatives — apply each row's rule:

| What | Channel | When |
| --- | --- | --- |
| Screenshots of the chosen variant | Uploaded once via the `/gh-issue-with-imgs` helper and embedded in the epic + the sub-issues that touch that surface | **Always.** Never a Dropbox path, never a literal `/ss` line — see Cross-machine portability. (Web: committed under `_temp-resource/.../shots/` and referenced in-repo — §1) |
| The prototype **files** the implementer must read | Copied into `_temp-resource/{epic#}-{slug}/` and delivered on a base branch — reusing the **bake mechanics** of the `-br` protocol | **Default for UI work.** `-pr` triggers the bake itself; passing `-br` alongside is redundant, not an error |
| The prototype dir path | Referenced as-is in `plan.md` | **Only under `-lo`**, where `plan.md` lives in cclogs beside it, so both travel together |

**Reuse `-br`'s bake mechanics, not its session semantics.** `-br` exists for the plan-locally →
implement-on-web direction and ends at a hand-off; `-pr` borrows only the steps (copy the dir into
`_temp-resource/{epic#}-{slug}/`, create `base/{impl-title-slug}`, commit, push, open the base PR,
add the "Use this PR as base" note to the epic body) and leaves Step 11's routing exactly as it
would otherwise be.

Bake only the **chosen** variant, plus the shared foundation it needs — never the whole exploration
dir. Twenty rejected roughs in `_temp-resource/` are noise the implementer has to triage.

**When a bake happened, Step 11 routes to `/x-wt-teams` on the epic even for a single-sub-issue
plan.** The normal single-topic shortcut to `/x-as-pr` branches off `$PARENT_BRANCH` and explicitly
ignores the epic's base branch — so it would never see `_temp-resource/`, and the baked prototype
would silently fail to reach the implementer. `/x-wt-teams` reads the "Use this PR as base" note
and reuses the base branch, which is the machinery the bake depends on. Say in the Step 11 summary
that the route was taken because of the bake. (Under `-lo`, nothing is baked, so the ordinary
single-sub-issue route to `/x-as-pr --local {sub-spec-path}` stands.)

**Flag interactions this section settles:**

- **`-lo` wins over the bake, always.** Under `-lo` the prototype stays in cclogs next to
  `plan.md` and is referenced by path — including with `-toco` / `-tocl`, whose destinations start
  in this same local repo and can read the coordination dir. There is no contradiction to resolve:
  `-lo` means no bake, full stop.
- **`-lo` + an explicitly typed `-br` is rejected.** The bake protocol needs an epic number for its
  path and an epic body for its "Use this PR as base" note, and local mode creates neither. Name
  the collision and stop rather than inventing a local bake protocol.
- **`-po` keeps the checkpoint and the bake.** The prototype loop runs, the plan is created, the
  bake happens (the later session needs the files) — and nothing is implemented, merged, or
  launched. `-po`'s existing precedence over `-a` / `-m` / `-toco` / `-tocl` is unchanged.
- **`-f` / `-nf` and `-ri` / `-nori` keep their downstream-only meaning.** In particular `-nf` says
  nothing about this loop: fixing a variant that rendered broken is part of building the round, not
  an auto-fix step.

Every issue that carries a prototype screenshot also carries the **Screenshot Requirement
Contract** — `Expected:` / `Forbidden:` / `Unknown:` / viewport — per the "Visual intent — not just
the image" rule. A screenshot without it is an incomplete requirement: the implementer picks a
convenient proxy metric, the proxy passes, and the visual change never lands.

And carry the authority order into every sub-issue that references the prototype, in one line:

> The prototype is direction for **structure and behaviour**, not a pixel spec. Port its layout and
> interaction; use the project's real design tokens and components, never the mock's values.
> Exact visual requirements, where they exist, are named explicitly above.

## 10. What the rest of the workflow gets

- **Step 3 (draft)** — decompose the *chosen direction*, not the original free text. Surfaces the
  loop settled are now concrete, so sub-tasks get sharper acceptance criteria than they would have
  had; scope the loop killed does not become sub-issues.
- **Step 3.6 (classify)** — the loop resolves **the decisions it actually settled, and only those**.
  Record `**Plan mode:** design-decision (direction settled by the -pr loop)`, do not reopen the
  settled direction, and classify every *remaining* scope / content / architecture choice under the
  normal Step 3.6 rules — a settled look does not settle what ships first. Acceptance also does not
  remove Step 3.5's integration **confirm** sub-issues: those exist for cross-wave correctness, not
  for taste.
- **Step 4 (plan log)** — add a `## Prototype` section: the dir, how many rounds ran, the chosen
  variant, what the feedback actually settled, and which directions were rejected and why. That
  last part is what stops a later session re-proposing a rejected idea.
- **Step 4 + Step 9 (requirements) — the accepted feedback IS a requirements change, and must be
  written into the checklist as one.** Recording it only as narrative in `## Prototype` is not
  enough: Step 4's Original requirements checklist and Step 9's verifier both center the *original*
  request, so without this the verifier either misses a requirement the user added at the
  checkpoint or flags a deliberately dropped one as missing and "restores" it. Update the checklist
  explicitly, in three buckets:
  - **Added** — requirements the checkpoint introduced that the original request never mentioned.
  - **Removed** — requirements the user deliberately rejected during the loop. Mark them struck and
    say *rejected at round N*, so Step 9 knows their absence is intentional.
  - **Superseded** — original requirements the accepted direction replaces; record both sides.
- **Step 10 (cleanup audit)** — when a bake happened, `/big-plan`'s usual "Branches: none, PRs:
  none" manifest is wrong. Include the resource base branch and its base PR, role `parent`, with
  KEEP as the expected verdict: the implementation session consumes them and deletes the
  `_temp-resource/` subdir before the root PR merges.
- **Step 11 (summary)** — print the prototype dir, the chosen variant, and the round count
  alongside the epic, plus the base branch/PR when a bake happened and why the route went to
  `/x-wt-teams` if it did. Under the LOCAL ARTIFACT notice, the dir is in the same boat as the plan
  log: Dropbox-synced, invisible to web, and never a handoff dependency — which is exactly why the
  chosen variant was baked or embedded per §9.

## 11. Guardrails

- **Don't commit the exploration.** Its value is the direction it settled. Only the chosen
  variant's files reach the repo, and only under `_temp-resource/`, which the downstream session
  deletes before the root PR merges.
- **Don't port pixels.** Repeated in three places on purpose — it is the single most common way a
  prototype does damage.
- **Don't let the loop become the implementation.** A variant that grew real data fetching, real
  auth, or real state management has stopped being a rough. Cut it back or accept the direction and
  go plan.
- **Don't skip the brief to save a step.** N variants with no shared contract are not comparable,
  and a round you can't compare is a round you can't get feedback on.
