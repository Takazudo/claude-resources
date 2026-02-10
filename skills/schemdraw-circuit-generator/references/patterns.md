# Common Circuit Patterns

Proven patterns for common circuits. Copy and adapt these for your needs.

## Pattern 1: Voltage Divider

Two resistors in series creating a voltage tap point.

```python
import schemdraw
from schemdraw import elements as elm

with schemdraw.Drawing(file='voltage_divider.svg') as d:
    elm.SourceV().label('Vin')
    elm.Line().right(d.unit/2)
    elm.Resistor().down().label('R1\n10kΩ')
    elm.Dot()
    d.push()
    elm.Line().right(d.unit/2).dot(open=True).label('Vout', 'right')
    d.pop()
    elm.Resistor().down().label('R2\n10kΩ')
    elm.Ground()
```

**When to use**: Reducing voltage, creating reference voltage, sensor voltage scaling

## Pattern 2: RC Low-Pass Filter

Resistor followed by capacitor to ground - filters high frequencies.

```python
with schemdraw.Drawing(file='rc_filter.svg') as d:
    elm.Line().dot(open=True).label('Vin', 'left')
    elm.Resistor().right().label('R\n1kΩ')
    elm.Dot()
    d.push()
    elm.Line().right(d.unit/2).dot(open=True).label('Vout', 'right')
    d.pop()
    elm.Capacitor().down().label('C\n0.1µF')
    elm.Ground()
```

**Cutoff frequency**: f = 1/(2πRC)

**When to use**: Noise filtering, audio tone control, anti-aliasing

## Pattern 3: Inverting Opamp Amplifier

Classic inverting configuration with input and feedback resistors.

```python
with schemdraw.Drawing(file='inverting_opamp.svg') as d:
    op = elm.Opamp(leads=True)

    # Ground non-inverting input
    elm.Line().down(d.unit/4).at(op.in2)
    elm.Ground(lead=False)

    # Input resistor
    elm.Resistor().at(op.in1).left().idot().label('$R_{in}$\n10kΩ', loc='bot')
    elm.Line().length(d.unit/4).dot(open=True).label('$v_{in}$', 'left')

    # Feedback resistor
    elm.Line().up(d.unit/2).at(op.in1)
    elm.Resistor().tox(op.out).label('$R_f$\n100kΩ')
    elm.Line().toy(op.out).dot()

    # Output
    elm.Line().right(d.unit/4).at(op.out).dot(open=True).label('$v_{out}$', 'right')
```

**Gain**: A = -Rf/Rin = -10

**When to use**: Signal inversion, precise gain control, virtual ground circuits

## Pattern 4: Non-Inverting Opamp Amplifier

Non-inverting configuration with voltage divider feedback.

```python
with schemdraw.Drawing(file='noninverting_opamp.svg') as d:
    op = elm.Opamp(leads=True)

    # Input to non-inverting pin
    elm.Line().left(d.unit/2).at(op.in2).dot(open=True).label('$v_{in}$', 'left')

    # Feedback network on inverting pin
    elm.Line().up(d.unit/2).at(op.in1)
    elm.Resistor().tox(op.out).label('$R_f$\n90kΩ')
    elm.Line().toy(op.out).dot()

    # Ground resistor
    elm.Resistor().down().at(op.in1).label('$R_1$\n10kΩ')
    elm.Ground()

    # Output
    elm.Line().right(d.unit/4).at(op.out).dot(open=True).label('$v_{out}$', 'right')
```

**Gain**: A = 1 + Rf/R1 = 10

**When to use**: Buffer amplifier, impedance matching, voltage follower (Rf=0)

## Pattern 5: NPN Transistor Switch

Simple transistor switch for digital control of loads.

```python
with schemdraw.Drawing(file='transistor_switch.svg') as d:
    # Load resistor from Vcc
    elm.Line().up(d.unit/2).label('Vcc', 'top')
    R_load = elm.Resistor().down().label('Load\n1kΩ')

    # NPN transistor
    Q1 = elm.BjtNpn(circle=True).anchor('collector').label('Q1')

    # Base resistor
    elm.Resistor().left().at(Q1.base).label('$R_b$\n10kΩ')
    elm.Line().length(d.unit/4).dot(open=True).label('Input', 'left')

    # Emitter to ground
    elm.Line().down(d.unit/4).at(Q1.emitter)
    elm.Ground()
```

**When to use**: LED driver, relay control, logic-level interfacing

## Pattern 6: Voltage Follower (Buffer)

Unity-gain buffer with high input impedance.

```python
with schemdraw.Drawing(file='buffer.svg') as d:
    op = elm.Opamp(leads=True)

    # Input
    elm.Line().left(d.unit/2).at(op.in2).dot(open=True).label('$v_{in}$', 'left')

    # Direct feedback (unity gain)
    elm.Wire('-|').at(op.out).to(op.in1)

    # Output
    elm.Line().right(d.unit/2).at(op.out).dot(open=True).label('$v_{out}$', 'right')
```

**Gain**: A = 1 (unity)

**When to use**: Impedance buffering, driving multiple loads, ADC input buffering

## Pattern 7: RC High-Pass Filter

Capacitor followed by resistor to ground - filters low frequencies.

```python
with schemdraw.Drawing(file='rc_highpass.svg') as d:
    elm.Line().dot(open=True).label('Vin', 'left')
    elm.Capacitor().right().label('C\n0.1µF')
    elm.Dot()
    d.push()
    elm.Line().right(d.unit/2).dot(open=True).label('Vout', 'right')
    d.pop()
    elm.Resistor().down().label('R\n10kΩ')
    elm.Ground()
```

**Cutoff frequency**: f = 1/(2πRC)

**When to use**: DC blocking, AC coupling, bass attenuation

## Pattern 8: LED with Current Limiting

Safe LED circuit with series resistor.

```python
with schemdraw.Drawing(file='led_circuit.svg') as d:
    # Power
    elm.Line().up(d.unit/2).label('+5V', 'top')

    # Current limiting resistor
    elm.Resistor().down().label('R\n330Ω')

    # LED
    elm.LED().down()

    # Ground
    elm.Ground()
```

**Resistor calculation**: R = (Vsupply - Vled) / Iled

**When to use**: LED indicators, status lights, simple displays

## Pattern 9: Parallel Resistors

Two resistors in parallel for current distribution.

```python
with schemdraw.Drawing(file='parallel_r.svg') as d:
    elm.Line().dot(open=True).label('In', 'left')
    elm.Dot()
    d.push()

    # First branch
    elm.Resistor().down().label('R1\n10kΩ')

    d.pop()

    # Second branch
    elm.Line().right(d.unit)
    elm.Resistor().down().label('R2\n10kΩ')
    elm.Line().left(d.unit)

    # Rejoin
    elm.Dot()
    elm.Line().right(d.unit/2).dot(open=True).label('Out', 'right')
```

**Equivalent resistance**: 1/Req = 1/R1 + 1/R2

**When to use**: Current sharing, lower equivalent resistance, power distribution

## Pattern 10: Comparator Circuit

Opamp as voltage comparator.

```python
with schemdraw.Drawing(file='comparator.svg') as d:
    op = elm.Opamp(leads=True)

    # Signal input to inverting
    elm.Line().left(d.unit/2).at(op.in1).dot(open=True).label('Signal', 'left')

    # Reference voltage to non-inverting
    elm.Line().left(d.unit/2).at(op.in2).dot(open=True).label('Vref', 'left')

    # Output
    elm.Line().right(d.unit/2).at(op.out).dot(open=True).label('Out', 'right')
```

**Output**: High when Vin2 > Vin1, Low otherwise

**When to use**: Zero-crossing detection, threshold detection, schmitt trigger

## Pattern 11: Simple Buck Converter

Switching regulator for step-down voltage conversion.

```python
with schemdraw.Drawing(file='buck_converter.svg') as d:
    d.config(unit=3)

    # Input
    elm.Line().dot(open=True).label('Vin', 'left')
    elm.Dot()
    d.push()

    # Switch (MOSFET)
    elm.NFet().down().anchor('drain').flip().label('Q1')
    elm.Ground().at(elm.NFet.source)

    d.pop()

    # Catch diode
    elm.Diode().at(d.pop()).down().reverse().anchor('cathode').label('D1')
    elm.Ground()

    # Inductor
    elm.Inductor().right().label('L\n100µH')

    # Output capacitor and load
    elm.Dot()
    d.push()
    elm.Capacitor().down().label('C\n100µF')
    elm.Ground()

    d.pop()
    elm.Line().right(d.unit/2).dot(open=True).label('Vout', 'right')
```

**When to use**: Efficient voltage step-down, battery-powered devices

## Tips for Using Patterns

1. **Copy-paste and modify** - Start with pattern closest to your needs
2. **Adjust component values** - Change resistor/capacitor values as needed
3. **Add power connections** - Patterns show signal path, add Vcc/GND as needed
4. **Scale spacing** - Use `d.config(unit=3)` for more space
5. **Combine patterns** - Mix multiple patterns for complex circuits

## Request More Patterns via Context7

For patterns not shown here:

```
mcp__context7__get-library-docs(
  context7CompatibleLibraryID: "/cdelker/schemdraw",
  mode: "code",
  topic: "specific circuit type"
)
```

Examples:
- `topic: "differential amplifier"`
- `topic: "555 timer astable"`
- `topic: "H-bridge motor driver"`
- `topic: "Wheatstone bridge"`
