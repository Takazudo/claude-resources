---
name: schemdraw-circuit-generator
description: >
  Generate high-quality professional circuit diagrams using schemdraw Python library. Creates vector
  graphics (SVG/PDF/PNG) from natural language circuit descriptions. Supports extensive component
  library including resistors, capacitors, inductors, diodes, transistors, opamps, ICs, logic gates,
  and more. Use when (1) User requests circuit diagrams or schematics, (2) User wants
  professional/publication-quality output, (3) User needs vector graphics (SVG/PDF) for
  documentation, (4) Creating complex circuits with ICs opamps or digital logic, (5) User explicitly
  mentions schemdraw or wants alternative to ASCII circuits, (6) User needs diagrams for papers
  documentation or presentations.
---

# Schemdraw Circuit Generator

Generate professional, publication-quality circuit diagrams using schemdraw Python library. Outputs to vector formats (SVG, PDF) or raster (PNG).

## Quick Start Workflow

**🎯 RECOMMENDED: Incremental Conversational Approach**

This workflow builds diagrams step-by-step with visual confirmation at each stage. **Use this for complex circuits or when starting fresh.**

**A. Connection List** - Write explicit connection list showing all component pins
**B. Incremental Build Loop** - Build one component/section at a time:
1. **Add ONE component or connection** (e.g., "IC only", "add GND connection", "add R1")
2. **Execute** - Run Python script and save SVG
3. **Visual Check** - Generate screenshot via HTML wrapper + headless browser
4. **User Confirmation** - Show screenshot, get approval before proceeding
5. **REPEAT** - Go back to step 1 for next component until circuit complete

   **Why this works:**
- Catches issues immediately when they occur
- Easy to debug single changes
- User can guide spacing, positioning, and layout decisions
- Prevents compound errors that are hard to untangle

**C. Final Verification** - Once all components added:
- Generate final screenshot
- Trace each connection from Step A connection list
- Verify all component values, labels, pin numbers present

**D. Complete** - Deliver connection list AND final diagram

---

**⚡ ALTERNATIVE: All-at-Once Approach** *(Only for simple circuits or experienced users)*

Use this workflow ONLY when:
- Circuit is simple (< 5 components)
- You have high confidence in layout
- User explicitly requests complete diagram in one shot

**A. Connection List** - Write explicit connection list showing all component pins
**B. Generate Complete Code** - Create schemdraw code implementing ALL connections
**C. Execute** - Run Python script and save SVG
**D. Visual Verification (MANDATORY)** - Perform comprehensive visual assessment
- Generate screenshot via HTML wrapper + headless browser
- **LIST ALL PROBLEMS FIRST** (don't fix one-by-one - you'll forget issues!)
- Apply ALL fixes at once
- Confirm with fresh screenshot
- **REPEAT** until all problems resolved
**E. Final Confirmation** - Trace each signal path from connection list
- If violations found: **Return to B** with fixes
- If clean: **Proceed to F**
**F. Complete** - Deliver both connection list AND diagram

**⚠️ Warning:** All-at-once approach often requires multiple fix iterations for complex circuits. Incremental approach is more reliable.

## Visual Verification Checklist (MANDATORY)

**🚨 CRITICAL REALITY: Only Human Visual Feedback is Reliable**

**AI visual assessment is NOT reliable for layout verification.** AI may report "all connections traceable" while humans see obvious layout problems. Therefore:

- ✅ **Generate screenshots for HUMAN review** - Always provide visual output
- ✅ **Wait for human feedback** - Don't make assumptions about visual quality
- ❌ **Don't trust AI visual verification** - It misses layout issues humans easily spot
- ❌ **Don't claim "complete" without user confirmation** - User must see and approve

### The Human-Driven Verification Loop

**This is like HTML+CSS development** - requires human eyes to judge visual quality.

1. **GENERATE SCREENSHOT** - Create visual output for user to review
2. **SHOW TO USER** - Present screenshot and ask for feedback
3. **LISTEN TO HUMAN FEEDBACK** - User will identify spacing, overlap, or clarity issues
4. **FIX BASED ON USER INPUT** - Apply changes user requests
5. **REPEAT** - Generate new screenshot, show to user, iterate until approved

**Key insight**: Users see layout problems AI cannot detect. Trust human feedback over AI assessment.

### Visual Verification Categories

#### 1. Connection Visibility Test

**"Technically connected" ≠ "Visually connected"**

For each connection in your connection list:
- ✅ Can you visually TRACE the line end-to-end?
- ✅ Are junction dots visible at split points?
- ❌ Are lines overlapping IC edges? (Human can't see the connection!)
- ❌ Are lines hidden behind component bodies?
- ❌ Are connection points ambiguous?

**Common failure**: Line connects to IC pin at the edge of the IC box → looks disconnected even though code is correct.

**Fix**: Route connections AWAY from IC edges using Manhattan routing:
```python
# ❌ WRONG - line touches IC edge, invisible
elm.Line().at(junction).to(ic.PIN)

# ✅ CORRECT - route away from edge first
elm.Line().at(junction).down(0.5)
elm.Line().left(SMALL_SPACING)  # Clear the IC edge
elm.Dot()
elm.Line().down(0.5)
elm.Dot()
elm.Line().right(SMALL_SPACING + 1.0)  # Now visible approaching pin
```

#### 2. Label Overlap Detection

**🚨 CRITICAL RULE: Labels must NEVER overlap component symbols**

**Common overlap zones:**
- **Labels on component symbols** - ❌ FORBIDDEN (e.g., "10kΩ" text on resistor zigzag)
- Adjacent components on same signal path (R1 ↔ R2)
- IC center label ↔ pin labels (IC name ↔ VOUT)
- Component labels ↔ value labels
- Labels ↔ junction dots or lines

**Visual test questions:**
- ❌ Is label text sitting ON TOP of component symbol? (resistor, capacitor, inductor)
- ❌ Are any characters touching between different labels?
- ❌ Is label text crowded or cramped?
- ✅ Can you clearly read each label independently?
- ✅ Can you see the complete component symbol without text obscuring it?

**Fix priority order:**
1. **First: Increase spacing** - Most effective, cleanest solution
   ```python
   HORIZONTAL_SPACING = 1.5  # Increase from 1.0
   VERTICAL_SPACING = 1.5    # Increase from 1.0
   SMALL_SPACING = 0.75      # Increase from 0.5
   ```

2. **Second: Adjust label position** - Change `loc` parameter
   ```python
   # R1/R2 overlap example:
   elm.Resistor().label('R1\n10kΩ', loc='top', ofst=0.2)  # Push up
   elm.Resistor().label('R2\n1kΩ', loc='left')  # Move to opposite side
   ```

3. **Third: Reduce font size** - Only if spacing isn't feasible
   ```python
   .label('U2\nLM2596S', fontsize=10)  # Reduce from 11
   ```

4. **Fourth: Add offset** - Fine-tune position
   ```python
   .label('IC', ofst=-0.3)  # Shift left by 0.3 units
   ```

#### 3. Line Overlap Detection

**🚨 CRITICAL RULE: Lines touching IC edges = Connection ambiguity**

**Problem areas:**
- **Lines touching/overlapping IC box edges** - ❌ FORBIDDEN ("Is this connected?" - impossible to tell!)
- Lines crossing component bodies
- Lines crossing other lines without junction
- Lines crossing ground symbols

**Fix rules:**
- **NEVER use `.to(ic.PIN)` directly** - creates line touching IC edge
- Use `.at()` to position connections explicitly
- Use Manhattan routing (horizontal → vertical → horizontal only)
- Add intermediate junction dots to clarify path
- Route around component bodies, not through them
- **Leave visible gap between IC edge and incoming lines**

**Example - Correct IC connection:**
```python
# ❌ WRONG - line touches IC edge
elm.Line().at(junction).to(ic.VIN)

# ✅ CORRECT - visible gap before IC edge
elm.Line().at(junction).right(1.0)  # Stop BEFORE IC edge
# IC connects from current position automatically
```

#### 4. Definition of "Complete"

A diagram is complete ONLY when:
- ✅ Code executes without errors
- ✅ SVG generates successfully
- ✅ **USER has visually reviewed screenshot and approved** (MOST IMPORTANT)
- ✅ **USER confirms all connections are traceable**
- ✅ **USER confirms no visual issues** (overlaps, spacing, clarity)
- ✅ Every item from connection list is verified in diagram

**🚨 CRITICAL: Never claim "complete" without explicit user approval of visual output!**

AI cannot reliably assess visual quality. Only human confirmation counts.

### Screenshot Generation for USER Review

**Purpose: Generate visual output for HUMAN evaluation, not AI assessment.**

Use HTML wrapper + headless browser to create screenshots for user review:

```bash
# Generate SVG first
python3 /tmp/circuit.py

# Create HTML wrapper
cat > /tmp/view_diagram.html << 'EOF'
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Check</title>
<style>
body{margin:20px;background:white;display:flex;justify-content:center;align-items:center;min-height:100vh;}
svg{border:2px solid #333;max-width:100%;max-height:90vh;}
</style>
</head><body>
[Paste SVG content here]
</body></html>
EOF

# Capture screenshot
node ~/.claude/skills/headless-browser/scripts/headless-check.js \
  --url file:///tmp/view_diagram.html \
  --screenshot viewport
```

Then READ the screenshot and perform comprehensive visual assessment.

### Common IC Connection Patterns (Context7 Reference)

When working with ICs, query context7 for proper connection syntax:

```
topic: "IC integrated circuit pin connection"
topic: "wire routing shapes manhattan"
topic: "element positioning at anchor"
```

**Key IC patterns learned:**
- IC connects via **sequential flow** - current position flows to first left pin automatically
- Use `.at(ic.pinname)` to start FROM a specific pin
- Use `.at(junction)` BEFORE routing TO a pin to avoid edge overlap
- Pin names are anchors: `ic.VIN`, `ic.GND`, `ic.FB`, `ic.VOUT`

**Example of proper IC connection:**
```python
# Create junction BEFORE IC
elm.Dot()
pre_ic_junction = d.here

# IC connects automatically from current position (sequential flow)
ic = elm.Ic(pins=[...])

# Route from junction to IC pin explicitly
elm.Line().at(pre_ic_junction).down(1.0)
elm.Dot()
elm.Line().right(1.0)  # Now connects to IC.PIN visibly
```

## Using Context7 for Documentation

**CRITICAL**: Schemdraw has extensive features. When you need specific syntax, advanced features, or uncommon components, use context7:

```
mcp__context7__get-library-docs(
  context7CompatibleLibraryID: "/cdelker/schemdraw",
  mode: "code",
  topic: "your specific topic"
)
```

**When to use context7:**
- Uncommon components not in references/components.md
- Advanced features (custom elements, annotations, etc.)
- Specific IC pinout configurations
- Latest API changes or new features
- Troubleshooting unusual errors

**Examples:**
- `topic: "opamp operational amplifier circuits"`
- `topic: "transistor bjt npn pnp"`
- `topic: "wire routing shapes"`
- `topic: "seven segment display multiplexer"`

## Installation

```bash
pip install schemdraw
```

**Dependencies**: numpy, pillow (for PNG export), matplotlib (optional backend)

## Core Concepts

### Drawing Context

All diagrams use context manager:

```python
import schemdraw
from schemdraw import elements as elm

with schemdraw.Drawing(file='output.svg') as d:
    elm.Resistor().label('1kΩ')
    elm.Capacitor().down().label('10µF')
```

### Element Chaining

Elements chain sequentially, each picking up where last ended:

```python
elm.Resistor().right().label('R1')  # Goes right
elm.Capacitor().down().label('C1')  # Goes down from R1's end
elm.Line().left()                    # Goes left from C1's end
```

### Directional Methods

- `.up()`, `.down()`, `.left()`, `.right()` - Cardinal directions
- `.theta(angle)` - Arbitrary angle in degrees
- Optional length: `.up(length=2)`

### Positioning

- `.at(position)` - Place at specific location or anchor
- `.to(position)` - Draw to endpoint
- `.toy(y)` / `.tox(x)` - Manhattan routing
- `.anchor(name)` - Set which part is positioned

### Anchors

Elements have named connection points:
- Two-terminal: `start`, `end`, `center`
- Transistors: `base`, `collector`, `emitter` (BJT) or `gate`, `drain`, `source` (FET)
- Opamps: `in1`, `in2`, `out`, `vd`, `vs`
- ICs: Custom pin names

### Labels

```python
elm.Resistor().label('R1')                   # Simple label
elm.Resistor().label('$R_1$')                # LaTeX math
elm.Resistor().label('1kΩ', loc='bottom')   # Position
elm.Capacitor().label(('−', '$V_o$', '+'))  # Multiple (polarity)
```

### Connections

- `elm.Dot()` - Junction (filled circle)
- `elm.Dot(open=True)` - Terminal (open circle)
- `elm.Line()` - Straight connection
- `elm.Wire('shape')` - Routed: `'-|'`, `'|-'`, `'N'`, `'Z'`

## Step-by-Step Workflow (Incremental Approach)

### Step A: Create Connection List

**CRITICAL**: Start with explicit connection list, not the diagram.

Write every connection showing which pin connects to which:

```
Connections:
- +15V input → U2 (LM2596S) pin 5 (VIN)
- +15V input → C5 (100µF) → GND
- U2 pin 3 (ON) → +15V (always enabled)
- U2 pin 4 (VOUT) → Switching node
- Switching node → L1 (100µH) → +13.5V Output
- Switching node → D1 (SS34 cathode)
- D1 (SS34 anode) → GND
- +13.5V → C3 (470µF) → GND
- U2 pin 2 (FB) → R1 (10kΩ) → Tap
- Tap → R2 (1kΩ) → GND
- Tap → +13.5V (feedback sense)
- U2 pin 1 (GND) → GND
```

This list serves as the specification. The diagram must satisfy EVERY connection.

### Step B: Incremental Build - Start with Foundation

**CRITICAL**: Build circuit incrementally, one component/connection at a time.

**Typical build order:**
1. Start with IC only (no connections)
2. Add power connections (VIN, ON pins to input rail)
3. Add ground connection
4. Add input decoupling capacitors
5. Add output stage (VOUT → switching node → L1 → output)
6. Add flyback diode and output capacitor
7. Add feedback network
8. Connect feedback to FB pin

**Example - First iteration (IC only):**

```python
import schemdraw
from schemdraw import elements as elm

# Black foreground with transparent background (default)
with schemdraw.Drawing(
    font='Arial',
    fontsize=11,
    color='black',
    transparent=True
) as d:
    d.config(unit=3)

    # Iteration 1: IC only
    ic = elm.Ic(
        pins=[
            elm.IcPin(name='GND', pin='3', side='left', slot='1/3'),
            elm.IcPin(name='ON', pin='5', side='left', slot='2/3'),
            elm.IcPin(name='VIN', pin='1', side='left', slot='3/3'),
            elm.IcPin(name='FB', pin='4', side='right', slot='1/2'),
            elm.IcPin(name='VOUT', pin='2', side='right', slot='2/2'),
        ],
        edgepadW=2.5,
        edgepadH=0.8,
        pinspacing=1.0,
        leadlen=1.0
    ).label('U2\nLM2596S', loc='center', fontsize=10)

    d.save('/tmp/buck_converter.svg')
```

### Step C: Execute and Verify

After EACH iteration:

1. **Run the script:**
   ```bash
   python3 /tmp/circuit_generator.py
   ```

2. **Generate screenshot:**
   ```bash
   cat > /tmp/view.html << 'EOF'
   <!DOCTYPE html>
   <html><head><meta charset="UTF-8"><title>Circuit Check</title>
   <style>
   body{margin:20px;background:white;display:flex;justify-content:center;align-items:center;min-height:100vh;}
   svg{border:2px solid #333;max-width:100%;max-height:90vh;}
   </style>
   </head><body>
   EOF
   cat /tmp/buck_converter.svg >> /tmp/view.html
   echo "</body></html>" >> /tmp/view.html
   node ~/.claude/skills/headless-browser/scripts/headless-check.js \
     --url file:///tmp/view.html --screenshot viewport
   ```

3. **Show user the screenshot**

4. **Get user confirmation:** "Looks good, add next component"

5. **Update code for next iteration** (e.g., add GND connection)

6. **REPEAT** steps C1-C5 until circuit complete

### Step D: Conversational Build Loop

**User guides the process:**
- "Add GND connection next"
- "Connect the input rail"
- "Shorten that line by half"
- "Move the label to the right side"

**You respond with:**
- Code update for requested change
- Execute script
- Generate screenshot
- Show result
- Wait for next instruction

**Benefits:**
- User can correct spacing/positioning immediately
- Catches label overlaps before they compound
- Easy to adjust layout decisions in real-time
- No need to untangle complex multi-component issues

### Step E: Final Verification

Once all components added and user confirms diagram looks complete:

1. **Visual check:** Generate final screenshot
2. **Connection trace:** Verify each connection from Step A list is present
3. **Component verification:** Check all values, labels, pin numbers
4. **User approval:** Get final confirmation

### Step F: Deliver

Provide to user:
1. **Connection list** (from Step A)
2. **Final SVG diagram** (verified version)
3. **Python code** (for reproducibility)
4. **Screenshot** (for documentation)

## Common Patterns

See `references/patterns.md` for copy-paste patterns:
- Voltage divider
- RC filter (low-pass, high-pass)
- Inverting/non-inverting opamp
- Transistor switch
- LED driver
- Buck converter
- Comparator
- And more...

## Reference Documentation

### components.md

Complete component library reference with syntax for all elements:
- Passive: Resistors, capacitors, inductors
- Semiconductors: Diodes, transistors (BJT/FET)
- Sources: Voltage, current, AC, batteries
- ICs: Opamps, logic gates, specialized ICs
- Power/Ground: Various ground and supply symbols
- Connections: Dots, lines, wires

### patterns.md

Copy-paste code for common circuits:
- Simple circuits (voltage divider, RC filter, LED)
- Opamp configurations (inverting, non-inverting, buffer, comparator)
- Transistor circuits (switch, amplifier)
- Advanced circuits (H-bridge, oscillators)

### best-practices.md

Guidelines for professional diagrams:
- Layout strategies
- Labeling conventions
- Connection techniques
- Readability tips
- Code organization
- Common mistakes to avoid

### examples.md

Complete working examples:
- 555 timer LED blinker
- Inverting opamp with power
- Differential amplifier
- Common emitter amplifier
- H-bridge motor driver
- RC oscillator
- Natural language parsing tips

### troubleshooting.md

Solutions to common problems:
- Installation and import issues
- Layout and positioning problems
- Label issues (Unicode, LaTeX)
- Connection problems
- Orientation issues
- Output problems
- Advanced issues

## Best Practices (Learned from Real Usage)

### 1. Consistent Label Positioning for Vertical Components

**Problem:** Labels on vertical components (resistors, capacitors going up/down) need consistent positioning to avoid overlaps and maintain professional appearance.

**Solution:** Use `loc='bot', ofst=0.5` pattern for all vertical components:

```python
# For components going upward
elm.Capacitor().up(2.0).label('C3\n470µF\n25V', loc='bot', ofst=0.5)
elm.Ground().flip()  # Flipped ground at top

# For components going downward
elm.Resistor().down().label('R1\n10kΩ', loc='bot', ofst=0.5)
elm.Resistor().down().label('R2\n1kΩ', loc='bot', ofst=0.5)
elm.Ground()  # Normal ground at bottom
```

**Why this works:** `loc='bot'` anchors label at component's bottom reference point, `ofst=0.5` shifts it right, positioning label cleanly on the right side of the component body without overlapping the symbol or connection lines.

### 2. IC Edge Padding for Label Clearance

**Problem:** IC center label (e.g., "U2 LM2596S") overlaps with pin labels on the right side.

**Solution:** Use adequate `edgepadW` parameter instead of label offsets:

```python
ic = elm.Ic(
    pins=[...],
    edgepadW=2.5,  # Wider box prevents label overlap
    edgepadH=0.8,
    pinspacing=1.0,
    leadlen=1.0
).label('U2\nLM2596S', loc='center', fontsize=10)
```

**Why this works:** Widening the IC box is cleaner than using label offsets. Typical values: `edgepadW=2.5` for ICs with 5+ pins.

### 3. Precise Junction Positioning

**Problem:** Need junction at exact midpoint for symmetrical connections.

**Solution:** Calculate position mathematically:

```python
# For horizontal rail between two pins
junction_y = (ic.VIN[1] + ic.ON[1]) / 2

# Build entire rail at calculated height
elm.Dot(open=True).at((x_position, junction_y)).label('+15V', loc='left')
elm.Line().right(2.0)
elm.Dot()
# ... all elements at same Y coordinate
```

**Why this works:** Calculating exact coordinates ensures straight lines and symmetrical layout. No diagonal connections or misaligned junctions.

### 4. Proper Push/Pop Stack Management

**Problem:** Multiple branches require careful stack management to return to correct positions.

**Solution:** Track push/pop pairs systematically:

```python
elm.Dot()
junction1 = d.here
d.push()  # Save junction1

# Branch 1
elm.Line().right(1.0)
elm.Dot()
junction2 = d.here
d.push()  # Save junction2

# Branch 2
elm.Line().right(1.0)
elm.Dot(open=True)

# Return to junction2
d.pop()  # Now at junction2

# Continue from junction2
elm.Line().down(0.5)
elm.Resistor()...

# Return to junction1
d.pop()  # Now at junction1
```

**Rule:** Every `d.push()` must have a matching `d.pop()`. Stack structure: LIFO (Last In, First Out).

### 5. Ground Symbol Orientation

**Problem:** Ground symbols appear upside-down when components go upward.

**Solution:** Use `.flip()` for upward-facing components:

```python
# Component going UP - flip ground
elm.Capacitor().up(2.0)
elm.Ground().flip()  # Ground symbol at top, points down

# Component going DOWN - normal ground
elm.Resistor().down()
elm.Ground()  # Ground symbol at bottom, points down
```

**Rule:** Ground always "points down" toward earth. Flip when it's physically above the component.

### 6. User Correction Responsiveness

**Problem:** User says "NO!" or expresses frustration - you misunderstood the request.

**Solution:**
1. **STOP immediately** - Don't continue with wrong approach
2. **Re-read user's EXACT words** - What did they literally say?
3. **Use exact parameters specified** - "right side" means `loc='right'`, not `loc='left'`
4. **Show result immediately** - Generate screenshot, don't assume it's correct
5. **Wait for confirmation** - Let user verify before proceeding

**Example from session:**
- User: "the RIGHT side of the capacitor symbol"
- Wrong: `loc='left'` (causes "NO!!!")
- Correct: `loc='right'` (what they literally requested)

### 7. Spacing Adjustments

**Problem:** User requests specific spacing changes during build.

**Solution:** Be responsive to spacing requests:

```python
# User: "halve the line there"
elm.Line().right(1.0)  # Changed from 2.0

# User: "change distance 1 -> 0.5 for each line"
elm.Line().down(0.5)  # Changed from 1.0
elm.Resistor()...
elm.Line().down(0.5)  # All spacing changed consistently
```

**Why this matters:** Small spacing adjustments (0.5 vs 1.0) significantly impact readability and label overlap prevention.

## Quick Tips

1. **Black foreground with transparent background** - Always use `font='Arial', color='black', transparent=True` for web documentation
2. **Start simple** - Use patterns from `patterns.md` as starting point
3. **Query context7** - For components/features not in references
4. **Save references** - Assign elements to variables: `Q1 = elm.BjtNpn()`
5. **Use dots** - Always at T-junctions, open dots for terminals
6. **Check anchors** - Use correct anchor names for element type
7. **Manhattan routing** - Use `.toy()` and `.tox()` for clean lines
8. **Increase spacing** - `d.config(unit=3)` if too cramped
9. **SVG format** - Best for documentation (vector, scalable)
10. **Consistent labels** - Use `loc='bot', ofst=0.5` for vertical components
11. **Listen carefully** - When user corrects you, use their EXACT words

## Output Formats

```python
# SVG (recommended - vector, scalable)
with schemdraw.Drawing(
    file='circuit.svg',
    font='Arial',
    fontsize=11,
    color='black',
    transparent=True
) as d:
    d.config(unit=3)
    # ... components ...

# PNG (raster, for compatibility)
# Note: Generate SVG first, then save as PNG
d.save('circuit.png', dpi=300, transparent=True)

# PDF (for print)
with schemdraw.Drawing(
    file='circuit.pdf',
    font='Arial',
    fontsize=11,
    color='black',
    transparent=True
) as d:
    d.config(unit=3)
    # ... components ...
```

## Black Foreground with Transparent Background (Default)

**All diagrams should use black foreground with transparent background by default:**

```python
with schemdraw.Drawing(
    font='Arial',         # Sans-serif font
    fontsize=11,
    color='black',        # Black foreground
    transparent=True      # Transparent background
) as d:
    d.config(unit=3)
    # ... components ...
```

**Why transparent background with black foreground:**
- Allows HTML container background to show through (e.g., custom background colors)
- Black lines and text are visible on light container backgrounds
- Works seamlessly with web-based documentation (Docusaurus, etc.)
- Professional appearance with clean contrast
- Integrates with any light-themed documentation

**Solid background (if specifically requested):**
```python
# Dark theme with solid black background and white foreground
with schemdraw.Drawing(
    font='Arial',
    fontsize=11,
    color='white',
    bgcolor='black'
) as d:
    # ... components ...

# Light theme with solid white background and black foreground
with schemdraw.Drawing(
    font='Arial',
    fontsize=11,
    color='black',
    bgcolor='white'
) as d:
    # ... components ...
```

## Example: Simple Voltage Divider

```python
import schemdraw
from schemdraw import elements as elm

# Black foreground with transparent background (default)
with schemdraw.Drawing(
    file='voltage_divider.svg',
    font='Arial',
    fontsize=11,
    color='black',
    transparent=True
) as d:
    elm.SourceV().label('12V')
    elm.Line().right(d.unit/2)
    elm.Resistor().down().label('R1\n10kΩ')
    elm.Dot()
    d.push()
    elm.Line().right(d.unit/2).dot(open=True).label('Vout\n(6V)', 'right')
    d.pop()
    elm.Resistor().down().label('R2\n10kΩ')
    elm.Ground()
```

## When to Use This Skill

- User requests circuit diagrams or schematics
- Publication-quality output needed
- Vector graphics (SVG/PDF) for documentation
- Complex circuits with ICs, opamps, logic
- Alternative to ASCII art diagrams
- Technical papers or presentations

## When NOT to Use

- User specifically wants ASCII art (use ascii-circuit-diagram-creator instead)
- Quick sketches where quality doesn't matter
- No Python environment available
