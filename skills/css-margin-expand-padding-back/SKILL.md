---
name: css-margin-expand-padding-back
description: CSS technique for expanding a block's background beyond its container using negative margin + matching padding. Use when: (1) User says 'margin expand', 'negative margin padding', 'break out of container', 'full-bleed background', 'edge-overflow layout', (2) A section background needs to extend wider than its parent container while keeping text aligned, (3) Creating visual break-out sections within constrained layouts.
user-invocable: true
argument-hint: "[target element or section description]"
---

# Negative Margin Expand + Padding Back

Expand a block's background beyond its container edge while keeping content aligned.

## Technique

```
Container (max-w-5xl)
│                                        │
│  ┌─── element ───────────────────────┐ │  ← normal
│  │ content                           │ │
│  └───────────────────────────────────┘ │
│                                        │
├──┬─── element with -mx + px ────────┬──┤  ← expanded
│  │ content (same position)          │  │
├──┴──────────────────────────────────┴──┤
│                                        │
```

Apply negative horizontal margin to pull the element beyond the container, then add matching padding to push the content back:

```html
<div class="-mx-hgap-sm px-hgap-sm">
  <!-- bg extends beyond container, content stays aligned -->
</div>
```

## Responsive Scaling

Scale the break-out progressively at each breakpoint. Match the negative margin and padding values so content stays aligned:

```html
<div class="
  -mx-hgap-sm  px-hgap-sm
  md:-mx-hgap-md  md:px-hgap-md
  lg:-mx-hgap-lg  lg:px-hgap-lg
  xl:-mx-hgap-xl  xl:px-hgap-xl
  2xl:-mx-hgap-2xl 2xl:px-hgap-2xl
">
```

## Key Rule

The negative margin must NOT exceed the parent container's padding. Otherwise the element overflows the page edge. If the parent section has `px-hgap-sm md:px-hgap-md`, start the negative margin at those same values.

## When to Use

- Section with a distinct background (color, texture, shadow) that should visually break out of the content container
- Creating visual emphasis while keeping text readable at the container width
- Full-bleed-like effects within a constrained layout
