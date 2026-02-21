---
name: ascii-circuit-diagram-creator
description: >-
  Create and validate ASCII circuit diagrams with automatic rule checking and iterative refinement.
  Use when the user requests circuit diagrams in ASCII/text format, or when creating technical
  documentation with embedded circuit schematics. Automatically ensures diagrams follow golden rules
  (no line crossings without junctions, no lines crossing labels, proper component connections,
  correct polarity). Includes preview validation using monospace rendering.
---

# ASCII Circuit Diagram Creator

Creates clear, unambiguous ASCII circuit diagrams through an iterative generate-validate-fix workflow.

## Quick Start Workflow

**A. Create connection list** - Write explicit text connections (which pin → which pin)
**B. Generate ASCII diagram** - Create circuit that satisfies ALL connections
**C. Preview** - Render in monospace font, capture as image
**D. Confirm** - Check for rule violations
- If violations found: **Return to B** with fixes
- If clean: **Proceed to E**
**E. Complete** - Deliver both connection list AND ASCII diagram

## Core Principles

**Start with connections, not the diagram** - The connection list is the specification. The ASCII diagram must satisfy every connection in the list.

**Connection list is a deliverable** - Always provide both:
1. Connection list (explicit, unambiguous)
2. ASCII diagram (visual representation)

**Preview is mandatory** - Label crossings and alignment issues are invisible in plain text but obvious in monospace rendering.

**Follow the golden rules** - See `references/golden-rules.md` for complete list:
1. Never cross lines without junctions
2. Never cross lines over text labels
3. Use label notation for distant connections - **Use "GND" labels frequently** to avoid cluttered diagrams (many components connect to GND)
4. Show parallel components as vertical drops
5. Maintain consistent column alignment
6. **Use Unicode characters** - `┌ ┐ └ ┘ ├ ┤ ┬ ┴ ─ │` for lines/junctions, `→ ←` for arrows
7. **Use boxes to identify components** - Each component gets its own box with proper padding (at least 1 space on each side)
8. **Separate complicated layouts** - When circuit details get complex, create a separate diagram block
9. **Avoid ambiguous ASCII** - Don't use `+` for junctions (ambiguous direction)
10. **No flying lines** - Vertical lines must maintain exact column alignment throughout
11. **Preview AND analyze carefully** - Looking at screenshots without tracing signal paths is worthless

## Step-by-Step Process

### Step A: Create Connection List

Write explicit text connections showing which pin connects to which:

**Format:**
```
Connections:
- Component1 pin X → Component2 pin Y
- Component2 pin Z → Component3
- Component3 → GND (parallel capacitor)
```

**Example (Buck Converter):**
```
Connections:
- +15V input → U2 (LM2596S) pin 5 (VIN)
- +15V input → C5 (100µF) → GND
- U2 pin 3 (ON) → +15V (always enabled)
- U2 pin 4 (VOUT) → Switching node
- Switching node → L1 (100µH) → +13.5V Output
- Switching node → D1 (SS34 Schottky cathode)
- D1 (SS34 Schottky anode) → GND
- +13.5V Output → R1 (10kΩ) → Tap point
- Tap point → R2 (1kΩ) → GND
- U2 pin 2 (FB) → Tap point
- +13.5V Output → C3 (470µF) → GND
- U2 pin 1 (GND) → GND
```

**Key points:**
- Every component connection must be listed
- Show pin numbers for ICs
- Indicate parallel vs. series connections
- Specify component values
- This list serves as the specification for the diagram

### Step B: Generate ASCII Diagram

Create the ASCII diagram that satisfies ALL connections from Step A:

**Layout strategy:**
- **Separate functional blocks** - Break complex circuits into labeled sections (IC, switching node, input caps, feedback network)
- **Branch right, then down** - Use `└───` to create branches that extend right first, then go vertical
- **Main flow horizontal, branches vertical** - Keep signal flow left-to-right, use vertical lines for branches to GND or parallel components
- Place IC in center of its section
- Input components on left or in separate section
- Output components on right or in separate section
- Route flyback diodes UPWARD to avoid label crossings (or use separate section)
- **Use Unicode characters throughout**: `├ ┤ ┬ ┴ ─ │ ┌ ┐ └ ┘` for lines/junctions, `→ ←` for arrows
- **Avoid ASCII `+` for junctions** - it's ambiguous about connection direction
- Apply label notation for distant connections (`FB ├2─→ Tap`)
- Ensure vertical lines maintain exact column alignment (no flying lines)

**Component representation:**
- ICs: Show pin numbers and names
- Passives: Include values (10µF, 5.1kΩ)
- Voltages: Label at each stage
- Parallel components: Draw as vertical drops to GND

**Best practice: Parallel capacitors (filter pairs):**
```
Power ──┬────────────────┬─── To IC
        │                │
       C1               C2
      100nF            470µF
     ceramic        electrolytic
     (CLOSE!)        (farther)
        │                │
       GND              GND
```
- T-junction (┬) at TOP on power rail
- Capacitor labels in middle of vertical lines
- Clear vertical drops to GND
- **Left-to-right order**: Ceramic (CLOSE to IC) on LEFT, electrolytic (farther) on RIGHT
- Shows physical placement hints

**Separated section example (recommended for complex circuits):**
```
IC Section:
                    ┌──────────────┐
Input ──────────────┤1 VIN     OUT 2├───── Signal Node
                    │              │
                 ┌──┤3 GND      FB 4├──── FB Tap
                 │  └──────────────┘
                GND

Switching Node Section:
                                 ┌─────────────┐
Signal Node ────────┬────────────┤ L1 (100µH)  ├──────────── Output
                    │            └─────────────┘
                    │
                    └─── D1 (Schottky)
                         Cathode
                            │
                         Anode
                            │
                           GND

Input Filter Section:
Input ───┬─── To IC
         │
         ├─ C1 (100µF)
         │    │
         │   GND
         │
         └─ C2 (100nF)
              │
             GND
```

**Key benefits of separated sections:**
- No line crossings between different functional blocks
- Crystal clear component grouping
- Easy to trace signal paths
- Simple to add/modify individual sections
- Branches use `└───` (right first, then down) or `┬` (split, then vertical)

**Critical**: Verify every connection from Step A is represented in the diagram.

### Step C: Preview

Run the preview script to render in monospace font and capture as image:

```bash
bash ~/.claude/skills/ascii-circuit-diagram-creator/scripts/preview_diagram.sh <diagram-text-or-file>
```

The preview creates an "almost empty HTML" with monospace font styling and captures the result using headless browser. This reveals issues invisible in plain text:
- Lines crossing labels
- Ambiguous junctions
- Incorrect component leg counts
- Junction topology errors

### Step D: Confirm

**CRITICAL**: Check the preview image for rule violations by **tracing each signal path** and **inspecting vertical line alignment**.

Simply looking at the screenshot is not enough - you must:
1. **Trace each signal** from source to destination
2. **Verify junctions** - does each `├ ┤ ┬ ┴` connect the correct signals?
3. **Check for false junctions** - do any signals appear connected that shouldn't be?
4. **Verify topology** matches the connection list from Step A
5. **Inspect vertical line alignment** - Look for "broken" or "floating" lines where alignment is off by even 1 character

If ANY violations found, **return to Step B** with fixes.

**Preview phase is critical for detecting:**
- Lines crossing labels (invisible in plain text, obvious in preview)
- False junctions where signals appear connected but shouldn't be
- Box padding issues where text touches borders
- Incorrect component leg counts

**Check against golden rules** (see `references/golden-rules.md`):

**Rule 1: Line crossings without junctions**
- Look for `┼` symbols (usually wrong)
- Check if non-connected lines cross

**Rule 2: Lines crossing labels**
- Look for vertical/horizontal lines passing over text
- Most common issue: switching node line crossing "Tap" or "GND" labels

**Rule 3: Disconnected components**
- Verify all components connect to appropriate nodes
- Check input capacitors connect to power rails
- Ensure feedback networks connect to correct pins

**Rule 4: Incorrect polarity**
- Diodes: Cathode to higher potential, anode to lower
- Buck converter: Flyback diode cathode to switching node, anode to GND

**Rule 5: Unclear parallel/series connections**
- Filter capacitors should be vertical drops to GND
- Should NOT appear in series with signal path

**Common fixes:**

**Fix: Line crossing label**
- **Solution A**: Route in opposite direction (if going down crosses labels, route up)
- **Solution B**: Remove intermediate label
- **Solution C**: Use wider spacing to route around

Example:
```
Before (crosses labels):    After (routes upward):
VOUT ├4───┬─→ L1            D1 ← Routes UP
          │                    │
          │ (crosses)      VOUT ├4───┴─→ L1
       D1 ↓
```

**Fix: Disconnected component**
- Add connection using appropriate junction (`┬ ├ ┤ ┴`)
- Ensure vertical line from power rail reaches component

**Fix: Inverted polarity**
- Swap component orientation
- For diodes: cathode (top) to higher potential, anode (bottom) to GND

**Fix: Ambiguous parallel/series**
- Redraw parallel components as vertical drops
- Use `├─→` to branch from main signal path

**Iteration**: Repeat B → C → D until all rules satisfied. Usually 2-3 iterations sufficient.

### Step E: Complete

Once all rules satisfied, deliver both:

1. **Connection list** (from Step A)
2. **ASCII diagram** (final validated version)

Optionally explain key connections or design choices if complex.

## Common Patterns

See `references/examples.md` for detailed examples of:
- Buck converter (LM2596S-ADJ)
- Common mistakes and fixes
- Before/after comparisons

## Validation Checklist

Before finalizing, verify:

- [ ] No line crossings without explicit junctions
- [ ] No lines crossing over text labels
- [ ] All components properly connected (no floating components)
- [ ] Parallel components shown as vertical drops to GND
- [ ] Diode polarity correct (cathode/anode orientation)
- [ ] **ASCII-only characters used** (no Unicode box-drawing or arrows)
- [ ] **No flying/disconnected lines** (vertical lines maintain column alignment)
- [ ] Consistent column alignment (no sliding vertical bars)
- [ ] Label notation used for distant connections
- [ ] Preview verified in monospace rendering

## When to Use This Skill

Use this skill when:
- User requests ASCII/text-format circuit diagrams
- Creating technical documentation with embedded circuits
- Need to ensure diagram clarity and correctness
- Converting schematic to ASCII representation
- Building circuit diagrams for code comments or markdown docs

**Key indicator**: User mentions "ASCII circuit," "text diagram," "schematic in text," or shows existing ASCII circuit that needs fixing.

## Tool Integration

**Preview tool**: Uses headless-browser skill to render diagrams in monospace font and capture screenshots for validation. This is **critical** for catching issues before finalizing.

**References**:
- `references/golden-rules.md` - Complete rule specification
- `references/examples.md` - Good/bad examples and fixes
