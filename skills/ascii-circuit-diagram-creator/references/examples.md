# ASCII Circuit Diagram Examples

## Buck Converter (LM2596S-ADJ) - Correct Example

This example demonstrates all golden rules properly applied:

```
                 ┌──────┐ ┌──────┐
                 │  C5  │ │  C6  │
                 │ 100µF│ │100nF │
                 └──┬───┘ └──┬───┘
                    │        │
┌──────────┐        │        │        ┌──────────────────┐
│ +15V In  ├────────┴────────┴────┬───┤5. VIN            │
└──────────┘                     │   │3. ON             │
                                 └───┤                  │
                                     │   U2 (LM2596S)   │                 ┌─────────┐
                                     │                  │                 │   L1    │
                                     │            VOUT 4├─────┬───────────┤  100µH  ├──┐
                                     │                  │     │           │  4.5A   │  │
                See feedback ────────┤2. FB             │     │           └─────────┘  │
                diagram              │                  │     │  ┌──────────┐          │
                                     │            GND 1 ├──┐  └──┤    D1    │     ┌────┴───┐
                                     └──────────────────┘  │     │   SS34   │     │ +13.5V │
                    │        │                             │     │ Schottky │     │  Out   │
                    │        │                             │     └────┬─────┘     └────┬───┘
                    │        │                             │          │           ┌────┴───┐
┌──────────┐        │        │                             │          │           │   C3   │
│   GND    ├────────┴────────┴─────────────────────────────┴──────────┴───────────┤  470µF │
└──────────┘                                                                       │  25V   │
                                                                                   └────────┘

Feedback Network (separate diagram to avoid clutter):

┌──────────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│ +13.5V Out   │     │   R1    │     │  Tap    │     │    R2    │
│              ├─────┤  10kΩ   ├─────┤  Point  ├─────┤   1kΩ    ├─→ GND
└──────────────┘     └─────────┘     └────┬────┘     └──────────┘
                                          │
                        ┌──────────────────┐
                        │   U2 (LM2596S)   │
                        │2. FB             │
                        └──────────────────┘
```

**What's correct:**
1. ✅ **Unicode characters used** - `├ ┤ ┬ ┴ ─ │ ┌ ┐ └ ┘` for junctions, `→` for arrows
2. ✅ **All components in boxes** - C5, C6, L1, D1, C3 each have their own box with padding
3. ✅ **Component leg counts correct** - Each 2-terminal component shows exactly 2 connections
4. ✅ **D1 topology clear** - Cathode to switching node, anode to GND
5. ✅ **C5/C6 topology clear** - Vertical drops from +15V to GND via T-junctions (`┴`)
6. ✅ **C3 shown as parallel** - Between output and GND (not series)
7. ✅ **No line crossings without junctions** - Clean routing throughout
8. ✅ **Switching node as T-junction** - VOUT branches to L1 and D1
9. ✅ **Feedback separated** - Complicated layout moved to separate diagram block
10. ✅ **GND labels used** - R2 uses `→ GND` instead of drawing connection
11. ✅ **Vertical alignment perfect** - All vertical lines maintain exact column position

## Common Mistakes and Fixes

### Mistake 1: Capacitor in Series

**❌ WRONG**:
```
L1 ──┬─→ C3 ──┬─→ Output  ← C3 looks like it's blocking current!
     │  470µF │
```

**✅ CORRECT**:
```
L1 ──┬─→ Output
     │
    C3 (470µF)  ← Clearly parallel
     │
    GND
```

### Mistake 2: Diode Routed Downward (Crosses Labels)

**❌ WRONG**:
```
VOUT ├4───┬─→ L1 ───┬─→ Output
          │  100µH  │
          │         ├─→ R1 ──┬─→ Tap ─→ R2 ─→ GND  ← "Tap" label
          │         │                              ← "GND" label
          │         ├─→ C3 ─→ GND
          │            470µF
       D1 (SS34)  ← Vertical line crosses labels!
      Schottky
          │
         GND
```

**✅ CORRECT** - Route D1 upward:
```
          │  ← D1 line goes UP
       D1 (SS34)
      Schottky
          │
         GND

VOUT ├4──────┴─→ L1 ───┬─→ Output  ← No crossing!
               100µH    │
                        ├─→ R1 ──┬─→ Tap ─→ R2 ─→ GND
```

### Mistake 3: Floating Components (Not Connected)

**❌ WRONG**:
```
        │     │
       C5    C6  ← Not connected to +15V!
      100µF 100nF
        │     │
       GND   GND

+15V ───┬────────────┤5 VIN  ← No connection shown
```

**✅ CORRECT**:
```
+15V ───┬────────────┤5 VIN  ← Junction splits to C5/C6
        │
       C5    C6
      100µF 100nF
        │     │
       GND   GND
```

### Mistake 4: Inverted Diode Polarity

**❌ WRONG** - Cathode to GND, anode to switching node:
```
                                           D1 (SS34)
                                          Schottky
                                              │
                                             GND
                                              ↑
VOUT ├4───┴─→ L1  ← Backwards!
```

**✅ CORRECT** - Cathode to switching node, anode to GND:
```
                                              │
VOUT ├4──────┴─→ L1  ← Cathode connection
                                              ↓
                                             GND
                                          Schottky
                                          D1 (SS34)  ← Anode
```

### Mistake 5: Ambiguous FB Connection

**❌ WRONG** - FB line crosses over components:
```
FB ├2───┼────┼─→ Junction  ← Crosses VOUT and L1!
        │    │
```

**✅ CORRECT** - Use label notation:
```
FB ├2─→ Tap  ← Points to label, no wire drawn

Output ─┬─→ R1 ──┬─→ Tap ─→ R2  ← Tap point labeled
```

## Preview Validation Example

Always preview diagrams in monospace font before finalizing:

```bash
bash $HOME/.claude/skills/ascii-circuit-diagram-creator/scripts/preview_diagram.sh diagram.txt
```

The preview will reveal:
- Label crossings not visible in plain text
- Column alignment issues
- Spacing problems
- Junction ambiguities
