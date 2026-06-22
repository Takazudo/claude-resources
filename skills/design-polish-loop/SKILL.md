---
name: design-polish-loop
description: "Iterative visual design-polish loop for an existing or WIP web UI. Each round: capture the live page as screenshots, judge it from the rendered pixels, and apply CSS polish toward a better-looking target using /css-wisdom's tight-token strategy — then re-capture and compare. The target direction is set by codex-imagegen 'north-star' mockups generated from the current screenshot, so the loop pursues a genuinely better look instead of nudging the existing one in place. Use when: (1) user says 'design-polish-loop', 'polish loop', 'polish this page/design/UI', (2) user wants to level up / upgrade the look of a current design or WIP project, (3) user wants AI-proposed redesign directions applied to a real rendering page, (4) user calls a design plain, dated, flat, or unpolished and wants it improved. Main use case: improving the current design of a WIP project. It polishes what already renders — not brand-new-from-scratch pages."
user-invocable: true
argument-hint: "[count] [route-or-url] [-n <directions>] [--no-imagegen] [--target <image>] [--cleanroom]"
---

# Design Polish Loop

Level up the look of a page that already renders. Each round **looks at the actual pixels**, finds the gap to a better-looking target, and closes it with on-system CSS — then re-captures and checks. The target is proposed by image generation, so the loop reaches for a genuinely nicer design rather than orbiting the current one.

**This is a thin orchestrator — it owns the loop, not the techniques.** It drives skills that already exist; its value is wiring them into a capture → propose → diagnose → polish → re-capture cycle with the right discipline at each step.

| Step | Skill it drives | Role |
| --- | --- | --- |
| Capture | `/headless-browser` | screenshot the live page at real breakpoints, worst-case content |
| Propose direction | `/codex-imagegen` | turn the current screenshot into polished "north-star" mockups (ChatGPT-billed) |
| Judge & diagnose | `/design-iteration-wisdom` | render→look→diagnose from pixels; reference-match against the chosen direction |
| Constrain the fix | `/css-wisdom` | polish using the **tight-token strategy** — system tokens, never arbitrary px/hex |
| Measure | `/verify-ui` | settle color / exact-value questions the eye can't (sample, don't eyeball) |

The novel ingredient is **imagegen as the direction engine**. A model handed the existing source over-anchors on it and "polish" collapses back to the original. A north-star mockup generated from the *screenshot* breaks that anchor — it shows a better look the loop then implements with real tokens. The mockup is **direction, not spec** (see caveats): mood, hierarchy, spacing rhythm, color, decorative treatment — never its exact text/numbers/components, which it hallucinates.

## Input parsing

- **count** (number): polish rounds. Default **2**.
- **route-or-url**: the page to polish (e.g. `/pricing` or `http://localhost:5173/pricing`). If omitted, ask which page, or infer the single obvious WIP route.
- **-n <directions>**: how many north-star mockups to generate up front. Default **2**. Each costs real ChatGPT usage — see [Cost](#cost).
- **--no-imagegen**: skip mockups entirely; run a pure `/design-iteration-wisdom` self-judged polish (free, but only nudges the current look — no fresh direction).
- **--target <image>**: use a supplied reference image as the north-star instead of generating one (skips imagegen; the reference-match discipline still applies).
- **--cleanroom**: implement the polish in an isolated prototype (`/prototype-first-wisdom`) instead of in-place. Use when the chosen direction is a big departure that would fight the existing markup; otherwise default in-place polish on the WIP.

## Workflow

### Step 0 — Detect context

Per `/design-iteration-wisdom` Step 0: find the **design-system / token source** (a project `*design-system*` skill/doc, or the existing token scale as de-facto), the **dev-serve command + port** (reuse a running server, don't spawn a duplicate), and the **target route(s)**. Load `/css-wisdom` tight-token articles now so polish stays on-system from round 1 — at minimum `methodology/design-systems/tight-token-strategy/index.mdx` and `component-tokens.mdx` (the system-tokens-vs-arbitrary-values decision framework), plus `color-tokens.mdx` / `typography-tokens.mdx` / `token-preview.mdx` as the change demands.

### Step 1 — Capture the baseline

Serve the page, then `/headless-browser` screenshot at **~390 / ~760 / ~1300px**, on the **worst-case content** (longest title, longest list, near-empty group), not the page top. Read every PNG. This baseline is both the imagegen input and the before-shot.

### Step 2 — Propose north-star directions (unless `--no-imagegen` / `--target`)

Feed the baseline (usually the desktop shot) to `/codex-imagegen` once per direction:

```bash
$HOME/.claude/skills/codex-imagegen/scripts/codex-imagegen.sh \
  --in <baseline-desktop.png> --out direction-1.png \
  --prompt "Polished, premium redesign of this screen. Keep the same content, structure, and information. Elevate spacing rhythm, typographic hierarchy, color, depth, and detailing. Modern, restrained, on-brand — not generic AI gradient slop."
```

Vary the brief per direction (e.g. "editorial / high-contrast", "calm / airy", "denser / utilitarian") to spread the options. Read the mockups, show them to the user, and **let the user pick the direction** — this is a taste call only a human owns. The picked mockup is the round target.

### Step 3 — Polish rounds (repeat `count` times)

Each round is `/design-iteration-wisdom` with the chosen direction as the reference:

1. **Diff, don't admire.** Crop the current render to the mockup's framing and walk it element-by-element against the direction (reference-match discipline). Name what's behind: grouping/contrast, hierarchy, type measure, color, weight, depth. Because an imagegen reference is a **fuzzy** spec, match its *design intent* (rhythm, hierarchy, palette, treatment) — do **not** reproduce its invented copy, fake rows, or un-buildable flourishes.
2. **Diagnose in token terms.** Map each gap to a move on the project's scale, using the `/css-wisdom` tight-token framework. "Cards read flat → raise elevation one step + tighten in-card gaps, widen between-card gap" beats "add shadow". Never introduce an arbitrary value where a token exists.
3. **Apply** the change with project tokens/components, minimal and targeted.
4. **Re-capture** at all breakpoints; **measure** anything near-threshold with `/verify-ui` (color especially — the eye lies; sample computed styles).
5. **Early exit** when a round closes no meaningful gap, or the render reads cleanly against the direction at every width. Diminishing returns end the loop before `count`.

Commit each accepted round (or stash before a risky one) so any round is revertible.

### Step 4 — Stop and hand to the human

Design has a taste component an AI approximates but doesn't own. When the computable invariants pass (`/design-iteration-wisdom` → contrast ≳2×, monotonic hierarchy) and it reads clean, **stop and show before / after / north-star side by side** for the final call. Don't loop chasing a verdict only a person can give.

## Cost

Each north-star mockup is one `/codex-imagegen` call — roughly **90k–230k ChatGPT tokens** (photoreal/complex prompts cost more). Generate directions **once up front**, not per round; the rounds themselves are free (capture + CSS). Re-invoke imagegen only to explore a new direction or when the loop plateaus and a fresh target is wanted. `--no-imagegen` removes the ChatGPT cost entirely.

## Important notes

- **Imagegen is direction, not spec.** Raster mockups can't be traced to code and hallucinate text/numbers/components. Use them for look and feel; take the real content from the live page. This is why the implementation is governed by tight tokens + the existing design system, not by the PNG.
- **Polish stays on-system.** The whole point of binding to `/css-wisdom`'s tight-token strategy is that improvements move along the project's scale. An arbitrary `#hex` or `13px` to "match the mockup" is a regression even if it looks closer — flag it, find the token.
- **In-place by default; clean-room for departures.** Incremental polish edits the WIP in place. A big directional jump that would fight the markup belongs in a `/prototype-first-wisdom` clean-room first (`--cleanroom`), then ported back deliberately.
- **Expect trial and error.** Directions that don't land get discarded; some rounds regress and get reverted. The loop is exploratory — the value is the design you converge on, and the human picks direction and final acceptance.
- **Two human checkpoints:** picking the direction (Step 2) and accepting the result (Step 4). Everything between is mechanical capture-diagnose-polish.
