---
name: verify-ui
description: >-
  Verify CSS/UI changes actually match what the user asked for. Uses deterministic computed style
  checks to avoid LLM confirmation bias. Use when: (1) After making CSS or layout changes and the
  user asks to verify, (2) User says 'verify ui', 'check the result', 'confirm it works', (3) User
  asks to check via /headless-browser for style-related work. Use PROACTIVELY after CSS/layout
  changes when asked to verify. Key principle: verify what the user specifically requested, not a
  generic checklist.
---

# Verify UI

Verify that CSS/UI changes actually match what was requested.

## Core Principle

The user asked you to do something ("add a border", "center the dialog", "make it full width on mobile"). After implementing, verify that **the specific thing they asked for** is actually working. Not a generic checklist — verify the requirement.

## Step 1: Clarify What to Verify

**If the requirement is clear** — translate it to verifiable CSS properties:

| User said | Verify these properties |
|-----------|------------------------|
| "add a border" | `border-style` (not `none`), `border-width` (not `0px`), `border-color` |
| "center the dialog" | `margin` (should be `auto` or symmetric), bounding box position |
| "full width on mobile" | `width` at narrow viewport, `max-width` |
| "remove rounded corners" | `border-radius` (should be `0px`) |
| "make text bigger" | `font-size` |
| "fix the z-index" | `z-index`, stacking relative to other elements |

**If the requirement is vague** ("check the result", "verify it looks good", "confirm it works") — **ask the user back**:

> "What specifically should I verify? For example: is it about the border, the positioning, the spacing, the colors, or something else?"

Do NOT proceed with a generic screenshot check when you don't know what you're looking for. That's how confirmation bias happens.

## Step 2: Extract Computed Styles

Run the verification script targeting the element in question:

```bash
node ~/.claude/skills/verify-ui/scripts/verify-styles.mjs "<URL>" "<SELECTOR>" "{logdir}/verify-ui" "<WIDTHS>" "<SCHEMES>"
```

**Detect viewport widths from the project's breakpoints:**

```bash
grep -n "breakpoint" src/styles/global.css 2>/dev/null
```

Pick widths that test each side of each breakpoint. Default: `400,800,1200`. Default schemes: `light,dark`.

**Parse the JSON output.** Find the properties relevant to the user's request and compare against expected values.

```
[PASS] border-style: solid (expected: not "none")
[FAIL] border-width: 0px (expected: 1px) ← THIS IS THE PROBLEM
```

If the computed style check reveals the issue, fix it. No screenshot analysis needed — the data is deterministic.

## Step 3: Visual Confirmation (if computed styles pass)

If computed styles look correct but the user's concern might be visual (layout, spacing, alignment), read the captured screenshots:

1. **Read** each screenshot with the Read tool
2. **Describe** what you see — specifically about the thing the user asked for
3. **Compare** against the requirement
4. **Report** whether it matches

**NEVER say "looks correct" without stating what specific thing you checked and what you observed.**

## When to Use Multiple Widths/Themes

- **Always** if the change involves responsive behavior (breakpoint-dependent styling)
- **Always** if the change involves colors or borders (may be invisible in one theme)
- **Not needed** for changes that are viewport/theme independent (e.g., changing font-weight)

## Anti-Patterns

- **Generic "take a screenshot and verify"** — verify WHAT? If you don't know, ask.
- **"Looks correct" after glancing at screenshot** — state what you checked.
- **Running verification without knowing what you're looking for** — confirmation bias guaranteed.
- **Checking only one viewport width when the change is responsive** — you'll miss breakpoint issues.
