# Design Knowledge (diagnosis reference)

Load at the Diagnose step. Name the real problem, then translate it into the project's own spacing/type/color tokens. Almost every spacing complaint is a *contrast* or *grouping* complaint in disguise.

## 1. The grouping tree

Build it for the region before assigning any spacing:

```
section
└── group            (one series, one card cluster, one fieldset)
    └── item         (one row, one card, one field)
        └── atoms    (label, value, icon, meta) — the tightest cluster
```

Assign spacing by level, monotonically increasing outward. A boundary between two nodes is sized by their nearest common ancestor: deeper (more related) → smaller gap.

- **Binders** = within-group gaps (atom↔atom, item↔item). Keep tight. A dense, evenly spaced list is *correct*.
- **Separators** = between-group and around-heading gaps. Generous. "Breathing room" belongs here.
- **The jump between binder and separator is the whole effect** — skip a step on the token scale (~1.6–2×+). Binder ≈ separator = no perceived grouping = "tight/mushy."
- A heading (and a group label such as "Filter by product") is a level boundary: it owns space above *and* below. Never butt it against a rule or its body.
- Grouping without space: common region (shared background/border/card), similarity, shared alignment line.

## 2. Symptom → cause → fix

| User says | Real cause | Fix (in token terms) |
|---|---|---|
| "tight" / "cramped" / "dense" | binder ≈ separator; no grouping | Raise separators 1–2 steps; keep binders tight. |
| "loose" / "too much space" / "floaty" | oversized binders dissolved the group | Shrink sibling gaps; keep separators large. |
| "messy" / "noisy" | non-monotonic spacing, or too many gap sizes | Collapse to 3–4 levels; enforce monotonic increase. |
| "doesn't breathe" (rows fine) | section/between-group gaps too small | Raise them; add heading top/bottom space. |
| "heading lost" / "no hierarchy" | heading too close to body, or size/weight too similar | Space above+below; raise the size/weight *ratio*. |
| "off" / "unbalanced" | alignment break or lopsided visual weight | Align edges to a shared line; rebalance the heavy element. |

## 3. Type, alignment, weight

- Body leading ~1.5–1.8; tight leading is for large display headings only. Tight body leading reads cramped in a way margins can't fix.
- Measure ~45–75 characters. Full-bleed text on a wide viewport feels cramped despite vertical air — cap the content width.
- One off-alignment reads as "off" even with perfect spacing. Prefer few alignment lines; a strong left edge beats many centered blocks.
- Visual weight: large, dark, saturated, image-dense things pull the eye; whitespace is itself weight. A photo grid needs more surrounding space than a text list of the same height.
- One focal point per region. Dim secondary/meta text, but keep body contrast ≥ ~4.5:1.

## 4. Responsive

Larger screens grow the gaps **between** groups and sections; gaps **within** a tight list/card stay roughly constant. Re-check the grouping tree at every breakpoint — a 2-column group collapsing to 1 column changes which gaps are binders vs separators.

**The fixed-width-sibling crush (a top mobile failure).** A `flex`-nowrap row with one flexible text column plus several fixed-width `shrink-0` siblings (date, thumbnail, badges) works on desktop and breaks on mobile: the fixed widths consume the row and the title collapses to **one character per line**. The width math fails silently on phones. Fix with a reflow, not a smaller font: split into a **primary cluster** (badge + title) and a **secondary cluster** (date + thumb), stack `flex-col` on mobile (title gets full width; meta on an indented second line), go `flex-row` at `sm`/`md`. Decorative `aria-hidden` elements may simply drop out on mobile. Any horizontal item layout needs an explicit mobile reflow plan.

**Separators are proportionate, not fixed-large.** A separator sized for a long group becomes a *hole* under a short one (a 2-item section with desktop-scale bottom padding looks broken). Be willing to step one level down.

## 5. Measuring rhythm

Computed styles via `/verify-ui`, or bounding-box gaps via Playwright (reuse the project's install if present):

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

Then check the invariants in SKILL.md against the numbers.

## 6. Anti-patterns

- **Uniform scaling** of a hierarchical layout (every gap +1 step) → tight or loose, never grouped.
- **Inflating binders** to "add air," especially on desktop → groups dissolve; clean mobile, broken desktop.
- **Redundant borders.** When each item already carries a top border, an extra container *bottom* border draws a second parallel line doing the same job. Pick one edge.
- **Invisible separator.** A border too close to the background in luminance reads as *no border*. Choose divider color by contrast against the bg; if a rule "can't be seen," raise its contrast, don't add more rules.
- **Fixed-width siblings crushing a flexible text column on mobile** (§4). Reflow, don't shrink.
- **Judging from tokens/classes without rendering** — at the worst-case content.
