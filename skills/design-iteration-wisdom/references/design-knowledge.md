# Design Knowledge (diagnosis reference)

General web-design principles, framed so they map onto a token-based design
system. Load this during the **Diagnose** step. Use it to name the *real*
problem and translate it into the project's own spacing/type/color tokens.

## Contents

1. The mental-model shift: magnitude → relationship
2. Grouping (Gestalt) — the foundation
3. Spacing as hierarchy (the grouping tree)
4. Symptom → cause → fix cheatsheet
5. Type: size, leading, measure
6. Alignment
7. Visual weight & balance
8. Contrast & emphasis
9. Responsive: escalate separators, hold binders
10. Measuring rhythm (turn looking into arithmetic)
11. Anti-patterns

---

## 1. The mental-model shift: magnitude → relationship

The instinct "this looks tight → make the spacing bigger" treats spacing as a
single magnitude to turn up or down. That instinct is the bug. Spacing is
**relational**: a gap is "tight" or "loose" only relative to the gaps around it
and to the size of the things it separates. The unit of design is the
**ratio/contrast between levels**, not any absolute value. Almost every spacing
complaint is really a *contrast* or *grouping* complaint in disguise.

## 2. Grouping (Gestalt) — the foundation

The eye assembles a layout into groups using a few cues. The dominant one for
layout is **proximity**: elements closer together are perceived as one unit.
This is why spacing *is* information — it tells the reader what belongs with
what. Supporting cues you can also wield:

- **Proximity** — closeness = belongs together. (Primary lever.)
- **Common region** — a shared background/border/card encloses a group (lets you
  group without much space).
- **Similarity** — shared size/color/shape reads as a set.
- **Continuity & alignment** — items on a shared line read as related.

Implication: to make something read as a group, you don't always need *more*
space around it — you can tighten its members, enclose them, or align them. To
separate groups, increase the space *between* them more than the space *within*.

## 3. Spacing as hierarchy (the grouping tree)

Before assigning any spacing, build the **grouping tree** for the region:

```
section
└── group            (e.g. one series, one card cluster, one form fieldset)
    └── item         (e.g. one row, one card, one field)
        └── atoms    (label, value, icon, meta) — the tightest cluster
```

Then assign spacing **by level, monotonically increasing outward**. A boundary
between two nodes gets a size set by their nearest common ancestor: deeper common
ancestor (more related) → smaller gap; shallower (less related) → larger gap.

- **Binders** = within-group gaps (atom↔atom, item↔item). Keep tight. A dense,
  evenly-spaced list is *correct* and reads as one scannable unit.
- **Separators** = between-group and around-heading gaps. Make generous. This is
  where "breathing room" belongs.
- **The jump between binder and separator is the whole effect.** Aim for a clear
  step on the token scale (skip a step, ~1.6–2×+). Equal-ish binder and separator
  = no perceived grouping = "tight/mushy."

A heading is itself a level boundary: it owns space *above and below* (it
separates its group from what precedes and introduces its own content). Never
butt a heading against its body text.

## 4. Symptom → cause → fix cheatsheet

| User says | Real cause | Fix (in token terms) |
|---|---|---|
| "tight" / "cramped" / "dense" | Low contrast: binder ≈ separator; no grouping | Raise *separators* (between-group, around-heading) by 1–2 steps; keep binders tight. Increase the ratio, don't inflate everything. |
| "loose" / "too much space" / "floaty" | Oversized binders: within-group gaps too big → group dissolved | *Shrink* the binders (sibling gaps) back down; keep separators large. |
| "messy" / "noisy" | Non-monotonic spacing, or too many distinct gap sizes | Collapse to 3–4 spacing levels; enforce monotonic increase up the tree. |
| "doesn't breathe" (but rows fine) | Separators/section gaps too small; no air around groups | Raise section + between-group gaps; add heading top/bottom space. |
| "heading lost" / "no hierarchy" | Heading too close to body, or weight/size too similar | Give heading space above+below; increase size/weight contrast. |
| "off" / "unbalanced" | Alignment break or lopsided visual weight | Align edges to a shared line; rebalance heavy elements (see §6–7). |

The two most common real fixes: **"tight" → increase contrast (raise
separators)**, **"loose" → shrink binders**. Both are the opposite of "scale
everything."

## 5. Type: size, leading, measure

- **Line-height (leading):** body copy wants relaxed leading (~1.5–1.8). Don't
  override running text to a tight leading to save space — it reads cramped in a
  way spacing can't fix. Tight leading is for large display headings only.
- **Measure (line length):** comfortable body measure is ~45–75 characters. Text
  that runs edge-to-edge across a wide viewport feels cramped even with vertical
  air — cap the content width.
- **Type scale = hierarchy too:** size and weight establish rank. If two levels
  look similar, increase the size/weight *ratio*, don't rely on spacing alone.

## 6. Alignment

Every element should align its edge to something. Shared edges create invisible
lines that the eye uses to bind a layout. A single off-alignment reads as "off"
even when spacing is perfect. Prefer few alignment lines (a strong left edge
beats many centered blocks). Center long-form text is hard to scan — left-align
body copy.

## 7. Visual weight & balance

Elements have visual "weight": large, dark, saturated, high-contrast, or
image-dense things pull the eye. A layout feels unbalanced when weight clusters
on one side with nothing to counter it. Levers: resize, add/remove whitespace
around the heavy element (whitespace is itself weight), shift color/contrast, or
counter-balance with another element. Images carry a lot of weight — a grid of
photos needs more surrounding space than a text list of the same height.

## 8. Contrast & emphasis

Emphasis comes from *difference*. If everything is bold, nothing is. Establish
one clear focal point per region, then a clear secondary, then the rest. Use the
project's accent/semantic colors for true emphasis only; dim secondary/meta text
(captions, dates) so the primary content leads. Check color contrast meets
accessibility (~4.5:1 for body text) — a "subtle" gray can be too subtle.

## 9. Responsive: escalate separators, hold binders

The "breathe more on desktop" instinct is right *only when applied to
separators*. Larger screens should grow the gaps **between groups and sections**;
the gaps **within** a tight list/card should stay roughly constant. Escalating
binders on desktop is the canonical way to turn a clean mobile layout into a
broken-looking desktop one. Re-check the grouping tree at every breakpoint — a
2-column group on desktop may collapse to 1 column on mobile, changing which
gaps are binders vs separators.

**The fixed-width-sibling crush (a top mobile failure).** A single
`flex`-nowrap row holding one flexible text column plus several fixed-width
`shrink-0` siblings (date, thumbnail, badges) works on desktop and *breaks* on
mobile: the fixed widths consume the row, the text column is squeezed toward
zero, and the title collapses to **one character per line** with empty space to
its side. The width math passes on desktop and fails silently on phones. Fix
with a reflow, not a smaller font: split the row into a **primary cluster**
(badge + title) and a **secondary cluster** (date + thumb), stack them
`flex-col` on mobile (title gets full width; meta on an indented second line)
and go `flex-row` inline at `sm`/`md`. Decorative, `aria-hidden` elements may
simply drop out on mobile. The lesson generalizes: any horizontal item layout
needs an explicit mobile reflow plan, because the grouping that reads as one row
on desktop must re-form as stacked lines when the width disappears.

**Separators are proportionate, not fixed-large.** A between-group separator
sized for a long group becomes a *hole* under a short one (a 2-item section with
desktop-scale bottom padding looks broken). Size separators to the rhythm and be
willing to step one level down — a separator should read as "space between
groups," not "an empty region."

## 10. Measuring rhythm (turn looking into arithmetic)

When the eye is uncertain, measure the *rendered* gaps and check the invariants.
Two ways:

- **Computed styles** via the project's `/verify-ui` (reads `getComputedStyle`)
  for margins/padding/gap on specific elements.
- **Bounding-box gaps** via a Playwright snippet (adapt selectors/URL; reuse the
  project's Playwright if present):

```js
// node + playwright: vertical gaps between sibling elements matching `sel`
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 2000 } });
  await p.goto(process.argv[2]); // URL
  const sel = process.argv[3];   // e.g. '[data-row]'
  const boxes = await p.$$eval(sel, els =>
    els.map(e => e.getBoundingClientRect()).map(r => ({ top: r.top, bottom: r.bottom })));
  for (let i = 1; i < boxes.length; i++)
    console.log(`gap ${i}: ${Math.round(boxes[i].top - boxes[i - 1].bottom)}px`);
  await b.close();
})();
```

Then verify: between-group gap ≳ 2× within-group gap; sibling gap ≤ item height;
spacing increases up the tree. These are arithmetic checks on real pixels — the
bridge between "I can't see" and "I can confirm."

## 11. Anti-patterns

- **Uniform scaling** of a hierarchical layout (every gap +1 step). → tight or
  loose, never grouped.
- **Inflating binders** (within-group gaps) to "add air." → groups dissolve.
- **Tight leading on body copy** to save space. → cramped regardless of margins.
- **Full-bleed text** with no measure cap on wide screens. → cramped despite air.
- **Equal spacing everywhere** / too many distinct gap sizes. → no hierarchy.
- **Escalating within-group spacing on desktop.** → clean mobile, broken desktop.
- **Redundant borders.** A border is a grouping cue (common region / continuity).
  When each item already carries a top border (or a container's children do), an
  extra container *bottom* border draws a second parallel line doing the same
  job — visual noise. Pick one edge; don't stack a container border against its
  children's borders.
- **Invisible separator.** A border whose color sits too close to the background
  in luminance reads as *no border* — the separation you intended silently
  vanishes. Choose the divider color/weight by how visible it should be
  (contrast against the bg), not by "a border exists in the markup." If a rule
  "can't be seen," raise its contrast, don't add more rules.
- **Labels with no breathing room.** A group/cluster label (e.g. "Filter by
  product") is a mini-heading: it needs space above and below, same as a heading
  (§4). Butted against a rule above and chips below, it reads cramped.
- **Fixed-width siblings crushing a flexible text column on mobile** (§9). → the
  title wraps one character per line. Reflow, don't shrink.
- **Judging from tokens/classes without rendering.** → the meta-anti-pattern this
  whole skill exists to prevent. Render and look — at the worst-case content.
