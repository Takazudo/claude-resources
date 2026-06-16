---
name: design-iteration-wisdom
description: >-
  Render→look→diagnose→fix loop for visual/UI design work, so you judge layout
  from the ACTUAL rendered pixels instead of from CSS class names and design
  tokens. Use this whenever you are refining how a web UI LOOKS — spacing,
  grouping, visual hierarchy, balance, alignment — and especially whenever a
  user says a layout looks "tight", "cramped", "too dense", "loose", "too much
  space", "off", "unbalanced", or "doesn't breathe". Use it after implementing
  any UI/CSS/layout change that needs to look right (not just pass tests), and
  whenever you are about to judge a layout from tokens or class strings without
  seeing it rendered. ALSO use it in reference-match mode — whenever the user
  hands you a concrete visual reference (an annotated screenshot, a mockup, a
  marked-up capture with drawn lines or "green = must have / red = must not", or
  "make it match this"): there the reference bitmap IS the spec, and success is a
  pixel diff of your render against it (presence AND absence — added elements the
  reference never showed are defects), not your own judgment that it "looks
  right". It synthesizes the project's own design-system rules with general
  design knowledge (Gestalt grouping, spacing-as-hierarchy, type, weight) to find
  and fix the REAL problem — not just make numbers bigger.
---

# Design Iteration Wisdom

## Why this skill exists

You cannot reliably judge a rendered layout from class names and design tokens.
Whether spacing reads as "tight" or "loose" is a property of the **rendered
composition** — the emergent result of `token → utility → responsive variant →
flex/grid resolution → content (image aspect, wrapped text) → browser layout`.
You only ever edit the **top** of that chain; the look only exists at the
**bottom**, after rendering. Reasoning from tokens alone produces confident,
wrong spacing — it can yield a too-tight AND a too-loose version from the same
rule, because the rule was about *magnitude* and the problem is about
*relationships*.

The fix is a loop: render it, **look at the pixels**, diagnose in real design
terms by combining the project's design-system rules with general design
knowledge, change code, look again. This skill is the judgment layer; the
project's design-system skill is the source of allowed values. Use both.

But render-and-look only works if you look **at the right thing**. There are two
different targets you can be judging against:

1. **An aesthetic rule you infer** — "this looks tight / unbalanced / heavy."
   The bitmap is evidence; *you* supply the rule (Gestalt grouping, hierarchy).
2. **A concrete reference the user handed you** — an annotated screenshot, a
   mockup, "make it match this." The bitmap **is** the rule; your job is to
   reproduce it, not to re-derive taste.

The loop (render → look) is identical for both, but the second has a failure
mode this skill exists to stop and previously did not name: you render your
change, look at *your own* output, and confirm it against **your mental model of
the request** instead of against the **reference's actual pixels** — so a
confident "looks right ✓" ships a result the user can see is wrong at a glance.
You had the same bitmap they did. If they can spot the error instantly, the
information was in the image; you compared it to the wrong thing. Reference-match
mode has its own discipline — see "Matching a reference" below — and it is not
optional whenever a reference exists.

## When to use

- A user calls a layout "tight" / "cramped" / "loose" / "too much space" / "off"
  / "doesn't breathe" / "unbalanced" / "messy".
- You just implemented a UI/CSS/layout change and need it to *look* right, not
  only pass build + unit tests. (Passing tests proves it works, never that it
  looks good.)
- You are refining spacing, grouping, visual hierarchy, alignment, or balance.
- You catch yourself about to decide a spacing/layout question by reading class
  strings or a token table instead of seeing the rendered result. That instinct
  is the trigger.
- **The user handed you a visual reference** — an annotated screenshot, a mockup,
  a marked-up capture (a drawn line, "green = must have, red = must not"), or
  "make it match this." The task is no longer taste; it is *reproducing a spec
  from a bitmap*. This is **reference-match mode** — read "Matching a reference"
  before you write any code, and again before you claim it is done.

## The core principle (the crux — internalize this)

**Spacing encodes grouping. Bind tight, separate loose.** Things that belong
together get *less* space between them; things that are distinct get *more*. The
**contrast (ratio) between hierarchy levels is the design — not the absolute
size.**

- **"Tight" usually means too little contrast** — every gap is similar, so the
  eye finds no groups and reads a uniform wall. The cure is rarely "more space
  everywhere." It is *more contrast*: often keep (or tighten) the within-group
  gaps and enlarge the between-group / around-heading gaps.
- **"Loose" usually means oversized binders** — the within-group gaps grew until
  the group dissolved. The cure is to *shrink the binders*, not the separators.
- **Never uniformly scale something hierarchical.** Uniform small = tight.
  Uniform large = loose/broken. Both destroy hierarchy.
- **On larger viewports, escalate the separators, hold the binders.** "Breathing
  room" on desktop comes from bigger gaps *around groups*, while the gaps *within*
  a tight list stay tight. Inflating within-group spacing on desktop is the
  classic way to make a page look broken.

For the full vocabulary (Gestalt grouping, type, alignment, visual weight, the
symptom→cause→fix cheatsheet, and how to measure) read
[references/design-knowledge.md](references/design-knowledge.md) during the
Diagnose step.

## Matching a reference (annotated capture / mockup)

When the user gives a concrete visual reference, **the reference is the spec.**
Success is not "does my result look good / look like a drawer / feel right" — it
is "does my rendered result match the reference, element by element." The
aesthetic-judgment half of this skill barely applies; this is *reproduction*,
and it has its own discipline because it has its own failure mode (the one that
created this section): rendering your change, looking at it, and confirming it
against **your own restatement** of the request instead of against the reference.

Run these, in order — and treat skipping any one as the bug:

1. **Read the reference as presence AND absence.** A positional annotation is a
   *complete* statement, not a hint. A green line drawn along the bottom edge
   says "a border goes here" **and, by every edge it does not cover, "no border
   anywhere else."** Marking where something *is* also marks where it *isn't*.
   Before coding, write the spec out both ways: *what the reference shows
   present* and *what it shows absent*. The classic, exact miss that motivated
   this section: reading "border here" and silently adding borders (a full
   perimeter) the reference never drew.

2. **Use the user's annotation legend verbatim.** They often state it ("green =
   must have, red = must not have"; arrows = position; a box = the element in
   question). Apply that meaning literally. If a mark is genuinely ambiguous, ask
   one question — do not paper over it with a guess.

3. **Verify by DIFF, never by self-judgment.** Render your result at the **same
   framing as the reference** (same region, same zoom — crop to it, even with a
   sharp/Playwright crop), set the two images side by side, and walk every
   element: present-in-both, absent-in-both, present-in-one-only. **Every
   "present in only one" is a defect — including elements present in *yours* but
   not the reference** (the added border, the extra rule, the shifted corner).
   "Does this look right?" judged on your render alone is the trap; the only
   question is "does this match *that*?"

4. **Do not author your own pass/fail checks from your interpretation.** A
   checklist you wrote from *your reading* ("tab has no top border ✓") can only
   confirm your reading — it passes while the result is wrong, because the misread
   is upstream of the check. With a reference, the sole valid check is "matches
   the reference." If you delegate verification to a subagent, give it the
   **reference image** and tell it to diff against it; never hand it your
   paraphrased checklist (that just launders your misinterpretation through a
   second agent).

5. **On "still wrong," re-derive from the reference — don't patch your model.**
   When feedback says it's still off, the reflex is the smallest edit to your
   *existing* output (you remove the line across the tab but keep the perimeter
   you should never have added). Stop. Re-extract the spec from the reference
   from scratch, as if seeing it for the first time. **Repeated feedback on the
   same element means your underlying model is wrong, not one step short** — a
   patch on a wrong model stays wrong.

## The loop

### Step 0 — Detect project context

- **Design-system rules / tokens:** look for a project skill (e.g.
  `/l-design-system`, or any `*design-system*` / `*design-tokens*` skill or doc).
  Invoke/read it — it defines the *allowed values*. Never invent raw px/rem when
  a token system exists. If none exists, use the values already present in the
  codebase as the de-facto scale.
- **Dev-serve command:** check `package.json` scripts and the project's
  CLAUDE.md / README for the dev or serve command and port (e.g. `pnpm dev`,
  `npm run dev`). Reuse an already-running server if one is up — don't spawn a
  duplicate.
- **Target URL(s):** the specific route(s) you are iterating on.

### Step 1 — Serve

Start the dev/preview server (or confirm one is running) and get the URL. For
gated preview deployments, note any auth cookie/header the project documents.

### Step 2 — Screenshot at multiple breakpoints

Use `/headless-browser` to capture the target at the breakpoints that matter —
at minimum **mobile (~390px)**, **mid (~760px)**, and **desktop (~1300px)**.
Responsive escalation rules can only be checked across widths; a single
screenshot will mislead you.

**Capture the worst case, not the page top.** Layout breaks hide in the extreme
content: scroll to the item with the **longest title / most wrapping text**, the
**longest list**, AND the **shortest / near-empty group** — at the **narrowest**
viewport. A clean top-of-page screenshot routinely hides a row whose title
collapses to one character per line three screens down, or a short section
drowning in separator space. Screenshot the region in question with its
worst-case data, not whatever renders first.

### Step 3 — Look, then measure

- **Look** at each screenshot with your own vision. Describe honestly what you
  see at each width: where do groups blur together? where does something float
  apart? what is misaligned or visually heavy? **If a reference exists, looking
  is comparative, not solitary** — crop your render to the reference's framing
  and diff the two element-by-element (see "Matching a reference"). Never judge
  your render in isolation when you have a spec to match it against.
- **Measure** when a judgment is close or you want an objective check. Get the
  *real rendered* pixel gaps (not nominal token values) and compute the contrast
  ratios — via `/verify-ui` (computed styles) or a Playwright bounding-box
  snippet (see references/design-knowledge.md → "Measuring rhythm"). Numbers turn
  "does it look grouped" into arithmetic you can verify.
- **Some claims are unmeasurable by eye — color is the clearest case, and the eye
  will lie to you confidently.** A muted off-white line (`rgb(214,211,209)`) and
  pure white (`rgb(255,255,255)`) look *identical* on a dark background: the eye
  normalizes "light line on dark" to "white." So a screenshot does **not** settle
  a color question — you will look at the muted line and call it white. The same
  goes for any near-threshold *value*: a 1px vs 2px border, exact alignment, an
  opacity, a token that resolves to almost-but-not-the-target. **Never report a
  color or exact value from looking. Sample it — and prefer the computed style
  over pixels.** For anything that is a real DOM element with the color set in CSS
  (a border, a background, text), `getComputedStyle(el).borderColor` /
  `.backgroundColor` is **authoritative**: it's the actual resolved value, and it
  skips the entire fragile pixel harness below. Query the element first. Fall back
  to **rendered pixel RGB from a screenshot** only when there is no single element
  to ask — the "rule" is really a pseudo-element / box-shadow, or you're checking
  an image, a gradient, or an antialiased edge. Either way, compare to the target
  number. "It looks white ✓" is not a verification; "the computed `border-color`
  is `rgb(255,255,255)` ✓" is. **If the user insists a color/value is wrong and
  you "can't see it," that is the tell that you are eyeballing something only
  measurement resolves — stop looking and sample.**
  - **When you must sample pixels, the harness itself can lie — make it robust.** A
    naive pixel probe produces false "muted/absent" readings that send you chasing
    ghosts: (a) Playwright's `clip` is **CSS pixels**, but the saved image is
    **device pixels** — don't multiply clip coords by `devicePixelRatio` (you'll
    sample the wrong place); map back by dividing the *read* coords. (b) A 1px line
    sits at a sub-pixel y, so a 1px-tall strip routinely *misses* it — sample a
    **band** (e.g. ±5px around the border) and take, per column, the pixel
    **furthest from the background color** (on a dark bg that's the brightest
    pixel; on a light bg the darkest — never hard-code "brightest" or a dark rule
    on a light bg samples the background and reads as absent). (c) Sample a
    **text-free region** — text glyphs in the foreground color contaminate the
    furthest-from-bg pixel and read as a false line. When two probes disagree, the
    naive one is wrong; trust the robust band-scan — but remember (a)–(c) only
    arise because you fell back to pixels; a queryable element never needs them.

### Step 4 — Diagnose (synthesize, don't guess)

Load [references/design-knowledge.md](references/design-knowledge.md) and name
the problem in design terms — grouping/contrast, hierarchy, alignment, weight,
type measure — **mapped onto the project's token scale**. Bad: "the rows need
more spacing." Good: "within-series row gaps ≈ between-series gaps → no grouping
contrast; tighten rows and raise the between-series gap a couple of steps on the
scale." The diagnosis is the synthesis of *general principle* + *project value*.

### Step 5 — Fix in code

Apply the change using project tokens/components. Keep changes minimal and
targeted to what the diagnosis identified.

### Step 6 — Re-screenshot and compare

Repeat Steps 2–5. Confirm the fix did what the diagnosis predicted and didn't
break grouping at another breakpoint. Usually 2–4 rounds converge. In
**reference-match mode** there is no "diagnosis" to confirm — re-crop and diff
against the reference, and if the same element is still wrong, **re-derive the
spec from the reference** rather than patching your model (see "Matching a
reference" → the repeated-feedback rule).

### Step 7 — Stop and hand to the human

Design has a taste component an AI approximates but doesn't own. When the
computable invariants pass and the screenshots read cleanly at every width,
**stop and show the human the before/after screenshots** for the final call.
Don't loop indefinitely chasing a verdict only a person can give.

In **reference-match mode** the bar is different — not taste but fidelity. Stop
when your render matches the reference element-for-element (presence *and*
absence), and show the human **your result next to their reference**, not just a
before/after of your own work, so the final check is the same direct comparison
you just made.

## Computable invariants (your eyeless self-check)

Even without perfect perception you can check these against measured px:

- **Contrast:** between-group gap ≳ **2×** within-group (sibling) gap.
- **Cohesion:** within-group sibling gap **≤** the item's own line-height /
  height (so siblings still read as one group).
- **Monotonic hierarchy:** spacing **strictly increases** as you move up the
  grouping tree (atom < item < sibling-gap < group < section).

If any fails, the layout will read as tight (low contrast), loose (binder too
big), or chaotic (non-monotonic) — regardless of how "generous" the absolute
values are.

**Reference fidelity (when a reference exists — the strongest invariant):** every
element the reference marks present is present; every region it leaves unmarked
is unchanged/absent; and **nothing exists in your render that the reference does
not show.** An added border, rule, box, or shifted edge that the reference never
contained is a defect even when it "looks fine" on its own — extra is wrong, not
just missing. This check is interpretation-free, so it catches the misreads your
own paraphrased checklists never will.
