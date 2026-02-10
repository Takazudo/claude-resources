# Troubleshooting Guide

Solutions to common issues when creating schemdraw circuits.

## Installation and Import Issues

### Issue: `ModuleNotFoundError: No module named 'schemdraw'`

**Solution**: Install schemdraw

```bash
pip install schemdraw
```

Or with specific version:
```bash
pip install schemdraw==0.22
```

### Issue: `ImportError: cannot import name 'elements'`

**Solution**: Use correct import syntax

```python
# Correct
from schemdraw import elements as elm

# NOT this
from schemdraw.elements import *
```

### Issue: SVG output blank or not generating

**Solution**: Ensure proper Drawing context

```python
# Correct - with context manager
with schemdraw.Drawing(file='output.svg') as d:
    elm.Resistor()

# OR - explicit draw
d = schemdraw.Drawing()
elm.Resistor()
d.draw()
d.save('output.svg')
```

## Layout and Positioning Issues

### Issue: Elements don't line up properly

**Problem**: Elements not aligning horizontally or vertically

**Solution A**: Use `.toy()` and `.tox()` for Manhattan routing

```python
# WRONG - elements may not align
elm.Line().at(R1.end).to(C1.start)

# RIGHT - explicit alignment
elm.Line().at(R1.end).tox(C1.start)  # Go to C1's X
elm.Line().toy(C1.start)              # Then to C1's Y
```

**Solution B**: Use `.endpoints()` method

```python
# Connect two specific points
elm.Line().endpoints(R1.end, C1.start)
```

### Issue: Component appears in wrong location

**Problem**: Component not where expected

**Solution**: Explicitly set position with `.at()`

```python
# WRONG - unclear where this goes
Q1 = elm.BjtNpn()
elm.Resistor()  # Where is this?

# RIGHT - explicit positioning
Q1 = elm.BjtNpn()
elm.Resistor().at(Q1.base).left()  # Clear position
```

### Issue: Cannot reference element position later

**Problem**: Need to return to a previous element

**Solution**: Save element as variable

```python
# Save reference
R1 = elm.Resistor().label('R1')
C1 = elm.Capacitor().down()

# Use reference later
elm.Line().at(R1.end).right()  # Return to R1
```

### Issue: Elements overlap

**Problem**: Components drawing on top of each other

**Solution**: Increase spacing with unit size

```python
with schemdraw.Drawing() as d:
    d.config(unit=3)  # More space (default is 2)
    # ... elements
```

## Label Issues

### Issue: Labels overlap with other elements

**Problem**: Text overlapping components or lines

**Solution A**: Change label position

```python
# Move label to different side
elm.Resistor().label('R1', loc='bottom')  # Instead of top
elm.Resistor().down().label('R1', loc='left')  # Instead of right
```

**Solution B**: Offset label

```python
elm.Resistor().label('R1', ofst=0.3)  # Offset from element
```

**Solution C**: Increase spacing

```python
d.config(unit=3)  # More space between elements
```

### Issue: Unicode characters not displaying (Ω, µ)

**Problem**: Omega or micro symbols showing as boxes

**Solution**: Use Unicode directly or LaTeX math mode

```python
# Unicode characters
elm.Resistor().label('10kΩ')   # Omega: Ω or \u03A9
elm.Capacitor().label('100µF') # Micro: µ or \u00B5

# OR use LaTeX
elm.Resistor().label(r'10k$\Omega$')
elm.Capacitor().label(r'100$\mu$F')
```

### Issue: LaTeX not rendering

**Problem**: Math formulas showing as plain text

**Solution**: Wrap in dollar signs and use raw string

```python
# WRONG
elm.Resistor().label('R_in')

# RIGHT - use LaTeX
elm.Resistor().label('$R_{in}$')
elm.Resistor().label(r'$R_{in}$')  # Raw string prevents escape issues
```

### Issue: Backslash in LaTeX getting escaped

**Problem**: `\frac` showing as `\\frac`

**Solution**: Use raw string (r-prefix)

```python
# WRONG - backslash gets escaped
elm.Resistor().label('$\\frac{V}{I}$')

# RIGHT - raw string
elm.Resistor().label(r'$\frac{V}{I}$')
```

## Connection Issues

### Issue: Junction looks disconnected

**Problem**: Lines don't appear to connect at T-junctions

**Solution**: Add `elm.Dot()` at junction points

```python
# WRONG - junction unclear
elm.Line().right()
d.push()
elm.Line().down()  # No dot - looks disconnected
d.pop()

# RIGHT - add dot
elm.Line().right()
elm.Dot()          # Clear junction
d.push()
elm.Line().down()
d.pop()
```

### Issue: Cannot find anchor on element

**Problem**: `AttributeError: 'Resistor' object has no attribute 'base'`

**Solution**: Use correct anchor names for element type

```python
# WRONG - resistor doesn't have 'base'
R1 = elm.Resistor()
elm.Line().at(R1.base)

# RIGHT - resistor has 'start', 'end', 'center'
R1 = elm.Resistor()
elm.Line().at(R1.end)

# Transistor HAS 'base'
Q1 = elm.BjtNpn()
elm.Line().at(Q1.base)  # OK
```

**Common anchors**:
- Two-terminal: `start`, `end`, `center`
- BJT: `base`, `collector`, `emitter`
- FET: `gate`, `drain`, `source`
- Opamp: `in1`, `in2`, `out`, `vd`, `vs`

### Issue: Lines crossing ambiguously

**Problem**: Can't tell if wires connect or cross

**Solution**: Use Wire routing or add dots

```python
# WRONG - ambiguous crossing
elm.Line().at((0,0)).to((2,2))
elm.Line().at((0,2)).to((2,0))

# RIGHT - route around
elm.Wire('-|').at((0,0)).to((2,2))
elm.Wire('|-').at((0,2)).to((2,0))

# OR add junction dot where they connect
elm.Line().at((1,1))
elm.Dot()  # Shows intentional connection
```

## Orientation Issues

### Issue: Component upside down

**Problem**: Diode arrow pointing wrong way

**Solution**: Use `.flip()` or `.reverse()`

```python
# Diode upside down
elm.Diode().up()

# Fix with flip
elm.Diode().up().flip()

# OR reverse direction
elm.Diode().down().reverse()
```

### Issue: Text is sideways/upside down

**Problem**: Labels oriented incorrectly

**Solution**: Labels stay horizontal by default

```python
# Labels stay horizontal automatically
elm.Resistor().down().label('R1')  # Label stays upright

# To rotate with element (rare)
elm.Resistor().down().label('R1', rotate=True)
```

### Issue: Need component at arbitrary angle

**Problem**: Want resistor at 45 degrees

**Solution**: Use `.theta()` method

```python
elm.Resistor().theta(45)  # 45 degree angle
elm.Resistor().theta(30)  # 30 degree angle
```

## Drawing Context Issues

### Issue: `d.here` returns unexpected position

**Problem**: Current position not where expected

**Solution**: Use `d.push()` and `d.pop()` to manage state

```python
# Save position
elm.Dot()
d.push()  # Save current position

# Draw branch
elm.Resistor().down()
elm.LED()

d.pop()  # Return to saved position

# Continue from junction
elm.Capacitor().right()
```

### Issue: Lost track of current position

**Problem**: Don't know where next element will go

**Solution**: Print current position for debugging

```python
R1 = elm.Resistor()
print(f"Current position: {d.here}")
print(f"R1 end: {R1.end}")
```

## Output Issues

### Issue: SVG file empty or corrupted

**Problem**: File exists but is 0 bytes or won't open

**Solution**: Ensure Drawing completes before file access

```python
# WRONG - trying to use file before context exits
with schemdraw.Drawing(file='output.svg') as d:
    elm.Resistor()
# File not ready yet!

# RIGHT - file ready after context exits
with schemdraw.Drawing(file='output.svg') as d:
    elm.Resistor()
# Now file is complete and saved
```

### Issue: Cannot see output in terminal

**Problem**: No visual output when running script

**Solution**: Save to file or display in notebook

```python
# Save to file
with schemdraw.Drawing(file='circuit.svg') as d:
    elm.Resistor()
# Open circuit.svg in browser

# OR in Jupyter notebook - auto displays
with schemdraw.Drawing() as d:
    elm.Resistor()
```

### Issue: PNG output is low quality/blurry

**Problem**: PNG looks pixelated

**Solution**: Increase DPI

```python
d = schemdraw.Drawing()
elm.Resistor()
d.save('output.png', dpi=300)  # Default is 96
```

### Issue: PDF has wrong fonts or missing symbols

**Problem**: PDF doesn't look like SVG preview

**Solution**: Use SVG backend or configure matplotlib

```python
# Use SVG (recommended)
schemdraw.use('svg')

# OR configure matplotlib fonts
import matplotlib
matplotlib.rcParams['font.family'] = 'sans-serif'
```

## Advanced Issues

### Issue: Need to customize element appearance

**Problem**: Want different color, line width, etc.

**Solution**: Use element styling methods

```python
elm.Resistor().color('red')                    # Red color
elm.Resistor().linewidth(2)                    # Thicker lines
elm.Resistor().linestyle('--')                 # Dashed lines
elm.Resistor().color('blue').linewidth(1.5)    # Chain styles
```

### Issue: Need element not in standard library

**Problem**: Special component not available

**Solution A**: Search context7 for the element

```
mcp__context7__get-library-docs(
  context7CompatibleLibraryID: "/cdelker/schemdraw",
  mode: "code",
  topic: "component name"
)
```

**Solution B**: Create custom element

```python
# Simple custom element
class MyElement(elm.Element):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.segments.append(elm.Segment([(0, 0), (1, 0)]))
```

### Issue: Circuit too complex, running out of space

**Problem**: Many components, crowded diagram

**Solution A**: Increase unit size

```python
d.config(unit=4)  # Lots more space
```

**Solution B**: Split into multiple diagrams

```python
# Input stage
with schemdraw.Drawing(file='stage1.svg') as d:
    # ... input stage components

# Output stage
with schemdraw.Drawing(file='stage2.svg') as d:
    # ... output stage components
```

**Solution C**: Use hierarchical blocks

```python
# Create subcircuit
with schemdraw.Drawing(show=False) as sub:
    elm.Resistor()
    elm.Capacitor()

# Use in main circuit
with schemdraw.Drawing() as d:
    elm.ElementDrawing(sub).label('RC Filter')
```

## Context7 for Unlisted Issues

For issues not covered here, consult schemdraw documentation via context7:

```
mcp__context7__get-library-docs(
  context7CompatibleLibraryID: "/cdelker/schemdraw",
  mode: "code",
  topic: "your specific issue"
)
```

Examples:
- `topic: "custom element creation"`
- `topic: "arrow annotations"`
- `topic: "timing diagrams"`
- `topic: "backend configuration"`

## Quick Diagnostic Checklist

When something goes wrong:

1. **Check imports**: Correct `from schemdraw import elements as elm`?
2. **Check syntax**: Using `with schemdraw.Drawing()` context?
3. **Check positioning**: All elements explicitly positioned with `.at()`?
4. **Check anchors**: Using correct anchor names for element type?
5. **Check file output**: File parameter in Drawing or calling `.save()`?
6. **Check spacing**: Try increasing `unit` size if crowded
7. **Check labels**: Using LaTeX `$...$` for math? Raw strings for backslashes?
8. **Check connections**: Dots at T-junctions? Open dots at terminals?

## Getting Help

If stuck after trying these solutions:

1. **Read element documentation** via context7
2. **Check schemdraw version**: `pip show schemdraw`
3. **Try minimal example**: Isolate the problem in simple code
4. **Check similar examples**: Look in examples.md for similar circuits
