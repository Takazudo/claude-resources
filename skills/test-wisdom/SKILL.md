---
name: test-wisdom
description: |
  Frontend testing strategy escalation guide. Helps AI choose the right testing
  level when current approach is insufficient. Use when: (1) User says something
  is still broken after AI claimed it was fixed, (2) User says 'it is not showing',
  'still broken', 'I don't see it', 'not working', (3) AI is unsure which testing
  approach to use, (4) User explicitly says 'test-wisdom'.
  Do NOT trigger on generic 'test it' or 'run tests' -- those should just run
  the project's test suite.
---

# Test Wisdom

When testing isn't catching the real problem, think about WHICH type of testing
actually proves the goal is achieved. The most common AI mistake is testing at
too shallow a level -- proving logic is correct while the UI is visually broken.

## The 5 Testing Levels

From shallowest to deepest verification:

### Level 1: Unit / Logic Tests

Pure JS function tests. No DOM, no browser.

- **Tools**: vitest, jest
- **Proves**: function returns correct value
- **Blind spots**: DOM rendering, CSS visibility, layout, user interaction
- **Example**: `expect(calcPrice(100, 0.1)).toBe(90)`

### Level 2: DOM-based Component Tests

Tests that mount components and check DOM state.

- **Tools**: vitest + jsdom/happy-dom, Testing Library, Enzyme
- **Proves**: element exists in DOM, has correct attributes, computed styles
- **Blind spots**: actual visual rendering, CSS cascade from parent, viewport layout
- **Example**: `expect(getComputedStyle(el).display).toBe('block')`

### Level 3: Build Output Verification

For systems that transform/generate output (templates, SSG, bundlers).
Build first, then assert on the output.

- **Tools**: vitest/jest reading built files, snapshot tests on output
- **Proves**: build pipeline produces correct output
- **Blind spots**: runtime behavior, visual rendering of output
- **Example**: built HTML contains expected `<meta>` tags, CSS file has expected rules

### Level 4: E2E Browser Tests (Scripted)

Build, serve, and test in a real browser with scripted assertions.

- **Tools**: `/headless-browser` (Tier 1/2), Playwright test scripts
- **Proves**: element is rendered, clickable, interactive in real browser
- **Blind spots**: subtle visual issues that need human judgment
- **Example**: page loads, button click opens dialog, no console errors

### Level 5: Deterministic + Visual Verification

Use `/verify-ui` for CSS property checks (deterministic, no confirmation bias),
then `/headless-browser` screenshots for visual confirmation.

- **Tools**: `/verify-ui` (computed styles as JSON), `/headless-browser` (screenshots + AI evaluation), MCP Playwright
- **Proves**: CSS values are correct AND visual appearance matches intent
- **Blind spots**: minimal -- deterministic data + visual confirmation
- **Example**: verify-ui confirms `border-width: 1px`, screenshot confirms it's visible

**For CSS/style changes, always prefer `/verify-ui` over screenshot-only checks.**
Computed styles are deterministic facts (`border-style: none`), not subjective
visual judgments that trigger confirmation bias.

## Decision Guide: Which Level Do I Need?

Ask: **"What would prove to a human that this works?"**

| What changed | Minimum level | Why |
| --- | --- | --- |
| Pure logic (util, algorithm, data transform) | Level 1 | No UI involved |
| Component props/state logic | Level 2 | Need DOM to verify rendering |
| Build config, template, SSG output | Level 3 | Need actual build output |
| CSS, layout, visibility, z-index | Level 5 | /verify-ui + screenshot |
| Interactive UI (modal, dropdown, drag) | Level 4 | Need real browser |
| "It doesn't look right" / visual bug | Level 5 | Need deterministic check + eyes |
| Complex UI with multiple interactions | Level 4+5 | Script + visual confirm |

## The Common Failure Pattern

User says "it's not shown." AI's typical (wrong) approach:

1. Check the logic: "the flag is `true`" -- passes
2. Declare it fixed

What actually happened:

- The flag IS true (Level 1 passes)
- The DOM element HAS `display: block` (Level 2 passes)
- But the parent container has `overflow: hidden` and `height: 0` (Level 5 would catch this)

**Rule: If the bug is visual, testing must be visual.** Level 1-2 tests cannot
prove visual correctness.

## Required Behavior When Testing

1. **Declare your test plan first.** Before running tests, tell the user:
- Which level(s) you will test at
- Why you chose that level
- What each test will prove

2. **Match test level to the goal.** If the goal is "the button should appear,"
   a unit test proving a boolean is `true` is insufficient.

3. **Escalate when lower levels pass but the problem persists.** If Level 1-2
   tests pass but the user says it's still broken, immediately go to Level 4-5.
   Do not re-run the same level.

4. **For UI/CSS changes, default to Level 5.** Use `/verify-ui` for deterministic
   computed style checks, then `/headless-browser` for visual confirmation.
   Do not stop at Level 1-2 for these.

5. **Report what was NOT tested.** If you only tested at Level 1-2, explicitly
   say: "I verified the logic but have not visually confirmed rendering. Want
   me to check with /verify-ui and /headless-browser?"

## Quick Reference: Tools per Level

| Level | Tool | When |
| --- | --- | --- |
| 1 | `vitest`/`jest` | Pure functions, algorithms |
| 2 | `vitest` + jsdom, Testing Library | Component DOM state |
| 3 | `vitest` reading build output | Template/SSG/bundler output |
| 4 | `/headless-browser`, Playwright scripts | Real browser, interactions |
| 5 | `/verify-ui` + `/headless-browser` | CSS correctness + visual confirm |
