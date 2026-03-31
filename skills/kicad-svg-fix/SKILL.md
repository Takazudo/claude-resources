---
name: kicad-svg-fix
description: "Fix SVG files for KiCad PCB import. Handles compound paths with holes (splits into separate paths), Illustrator DPI scale correction (72 to 96 DPI), and style cleanup. Use when: (1) User wants to import SVG into KiCad, (2) SVG has shapes with holes/cutouts that KiCad mangles, (3) SVG from Illustrator imports at wrong scale, (4) User says 'fix svg', 'kicad svg', 'svg import', or 'svg fix'."
allowed-tools:
  - Bash(python3 *)
  - Read
  - Write
  - Glob
---

# KiCad SVG Fix

Fix SVG files exported from Illustrator (or similar) for clean KiCad PCB import.

## Common Problems This Solves

1. **Compound paths with holes** — KiCad merges inner/outer paths into one weird polygon instead of treating holes as cutouts. Fix: split into separate `<path>` elements.
2. **Wrong scale** — Illustrator exports at 72 DPI, KiCad expects 96 DPI. Empirical factor: `1.33350873`. Fix: scale all coordinates.
3. **CSS styles** — KiCad ignores `<defs>/<style>` and CSS classes. Fix: replace with inline `stroke`/`fill` attributes.

## Usage

Run the bundled script:

```bash
python3 $HOME/.claude/skills/kicad-svg-fix/scripts/fix-svg-for-kicad.py INPUT.svg [OUTPUT.svg] [--scale FACTOR] [--no-scale]
```

- Default output: `INPUT-fixed.svg` (same directory)
- Default scale: `1.33350873`
- `--no-scale`: only split compound paths and clean styles, skip scaling
- `--scale 1.5`: use custom scale factor

## After Import — KiCad Target Layers

| Use case | Layer | Notes |
| --- | --- | --- |
| Board outline | `Edge.Cuts` | Hole = actual cutout in PCB |
| Silkscreen logo | `F.Silkscreen` | KiCad draws strokes, not fills |
| Copper shape | `F.Cu` | Use filled zones instead |

## Alternative Approaches

If the script doesn't cover a specific case:

### Inkscape Pre-processing

1. Open SVG in Inkscape
2. Select shape → **Path → Break Apart** (separates outer/inner)
3. Save as **Plain SVG** (not Inkscape SVG)
4. Import into KiCad

### DXF Export from Illustrator

1. File → Export → Export As → **DXF**
2. KiCad: File → Import → Graphics → select DXF
3. DXF handles holes/outlines more reliably than SVG

### svg2mod for Footprints

```bash
pip install svg2mod
svg2mod -i input.svg -o output.kicad_mod
```

Converts SVG directly to KiCad footprint (`.kicad_mod`), handles holes better than native SVG import.
