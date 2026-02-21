---
name: jlcpcb-bom-generate-from-kicad
description: >-
  Convert KiCad exported BOM and position files to JLCPCB PCBA (PCB Assembly) order format. Use
  when: (1) User has KiCad BOM CSV and .pos position files, (2) User needs to prepare files for
  JLCPCB PCBA ordering, (3) User mentions converting KiCad exports for JLCPCB, (4) User asks about
  CPL (Component Placement List) format. Handles BOM conversion (Designation→Comment, sorting
  designators), CPL conversion (negating Y coordinates, adding mm suffix, normalizing rotation), and
  can integrate with jlcpcb-component-finder skill to add LCSC part numbers. Includes ready-to-use
  Python scripts.
---

# KiCad to JLCPCB BOM/CPL Converter

Convert KiCad exported BOM and position files to JLCPCB PCBA order format.

## Quick Start

**IMPORTANT**: This skill includes ready-to-use Python scripts! Use them instead of copying inline code.

### Scripts Location

```
~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/
├── convert_to_jlcpcb.py      # Main conversion script
├── add_lcsc_numbers.py        # Add LCSC part numbers
└── create_parts_mapping.py    # Generate mapping template
```

### Basic Usage

```bash
# Step 1: Convert KiCad exports to JLCPCB format
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/convert_to_jlcpcb.py \
  bom.csv top.pos bottom.pos output_dir/

# Step 2: Add LCSC part numbers (interactive mode)
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/add_lcsc_numbers.py \
  output_dir/jlcpcb-bom.csv --interactive

# Or use mapping file
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/add_lcsc_numbers.py \
  output_dir/jlcpcb-bom.csv --map parts_mapping.json --filter-test-points
```

## Template Files

Reference templates (downloaded from JLCPCB) are located at:

- `~/.claude/skills/jlcpcb-bom-generate-from-kicad/templates/sample-bom.xlsx`
- `~/.claude/skills/jlcpcb-bom-generate-from-kicad/templates/sample-cpl.xlsx`

## Input Files (KiCad Exports)

### KiCad BOM CSV

Exported from KiCad's BOM tool. Format (semicolon-delimited):
```
"Id";"Designator";"Footprint";"Quantity";"Designation";"Supplier and ref";
1;"U6";"TO-263-2_L10.0-W9.1-P5.08-LS15.2-TL";1;"L7812CD2T-TR";;;
2;"R12,R3,R13";"R0603";3;"5.1k";;;
```

### KiCad Position Files (.pos)

Exported from KiCad's Fabrication Outputs > Component Placement. Format:
```
# Ref     Val               Package                   PosX       PosY       Rot  Side
C1        10uF              C1206                     46.7500   -12.4325  180.0000  top
R1        10k               R0603                     38.8600   -29.5025   90.0000  top
```

## Output Files (JLCPCB Format)

### JLCPCB BOM CSV

```csv
Comment,Designator,Footprint,JLCPCB Part #
L7812CD2T-TR,U6,TO-263-2_L10.0-W9.1-P5.08-LS15.2-TL,C13456
5.1k,"R13,R3,R12",R0603,C23186
```

### JLCPCB CPL (Component Placement List) CSV

```csv
Designator,Mid X,Mid Y,Layer,Rotation
C1,46.7500mm,12.4325mm,Top,180
R1,38.8600mm,29.5025mm,Top,90
```

## Conversion Rules

### BOM Conversion

| KiCad Field | JLCPCB Field | Notes |
|-------------|--------------|-------|
| Designation | Comment | Component value/name |
| Designator | Designator | Multiple refs comma-separated, sort alphanumerically |
| Footprint | Footprint | Keep as-is |
| (none) | JLCPCB Part # | Must be added - use scripts or `jlcpcb-component-finder` skill |

**Key transformations:**

- Designators are sorted alphanumerically (C1, C2, C10, R1, R2, etc.)
- Test points (TP*) can be auto-filtered
- Mounting holes (H*, MH*) can be excluded

### CPL Conversion

| KiCad Field | JLCPCB Field | Transformation |
|-------------|--------------|----------------|
| Ref | Designator | Keep as-is |
| PosX | Mid X | Add "mm" suffix |
| PosY | Mid Y | **Negate the value** (KiCad uses negative Y), add "mm" suffix |
| Side | Layer | Capitalize ("top" → "Top", "bottom" → "Bottom") |
| Rot | Rotation | Normalize to 0-360 (add 360 if negative) |

**Critical transformation:** Y-coordinates must be negated because KiCad and JLCPCB use different coordinate systems.

## Workflow

### Step 1: Export from KiCad

**BOM:**

1. Open schematic in KiCad
2. Tools → Generate BOM
3. Select CSV format with semicolon delimiter
4. Export as `bom.csv`

**Position Files:**

1. Open PCB layout in KiCad
2. File → Fabrication Outputs → Component Placement (.pos)
3. Export `top.pos` and `bottom.pos` (or just one side)

### Step 2: Convert Files

Use the bundled script:
```bash
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/convert_to_jlcpcb.py \
  dist/kicad-bom-outputs/bom.csv \
  dist/kicad-placement-outputs/top.pos \
  dist/kicad-placement-outputs/bottom.pos \
  dist/jlcpcb-ready/
```

Output:

- `dist/jlcpcb-ready/jlcpcb-bom.csv` - BOM (without LCSC numbers)
- `dist/jlcpcb-ready/jlcpcb-cpl.csv` - CPL (ready to upload)

### Step 3: Add LCSC Part Numbers

**Option A: Interactive Mode** (good for small projects)
```bash
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/add_lcsc_numbers.py \
  dist/jlcpcb-ready/jlcpcb-bom.csv \
  --interactive \
  --output dist/jlcpcb-ready/jlcpcb-bom-with-lcsc.csv
```

**Option B: Mapping File** (good for reusable projects)
```bash
# 1. Create mapping template
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/create_parts_mapping.py \
  --output parts_mapping.json

# 2. Edit parts_mapping.json to add your LCSC numbers
# {
#   "LM7805ABD2T-TR": "C86206",
#   "10k": "C25804",
#   ...
# }

# 3. Apply mapping
python3 ~/.claude/skills/jlcpcb-bom-generate-from-kicad/scripts/add_lcsc_numbers.py \
  dist/jlcpcb-ready/jlcpcb-bom.csv \
  --map parts_mapping.json \
  --filter-test-points \
  --output dist/jlcpcb-ready/jlcpcb-bom-with-lcsc.csv
```

**Option C: Use jlcpcb-component-finder skill**
For unknown parts, use the companion skill to search JLCPCB database:
```
User: "Find LCSC part for LM7805 TO-263 package"
Claude: [Uses jlcpcb-component-finder skill]
```

### Step 4: Upload to JLCPCB

1. Go to https://jlcpcb.com/quote
2. Upload Gerber files
3. Enable "SMT Assembly"
4. Upload:
  - BOM: `jlcpcb-bom-with-lcsc.csv`
  - CPL: `jlcpcb-cpl.csv`
5. Review component matching
6. Verify placements in viewer
7. Checkout!

## Filtering Components

Components typically excluded from JLCPCB PCBA:

- Test points (TP*)
- Mounting holes (H*, MH*)
- THT connectors (unless specifically supported)
- Components you want to solder manually

The `add_lcsc_numbers.py` script includes `--filter-test-points` flag to auto-exclude:

- Designators starting with TP, H, MH
- Comments like "GND", "+5V", "+12V" (test point labels)

## Real-World Example

From the zudo-power-usb-pd project:

```bash
# 1. Convert KiCad exports
python3 convert_to_jlcpcb.py \
  zudo-pd.csv \
  zudo-pd-top.pos \
  zudo-pd-bottom.pos \
  jlcpcb-ready/

# Output:
# ✅ Converted BOM saved to: jlcpcb-ready/jlcpcb-bom.csv
#    Total components: 43
# ✅ Converted CPL saved to: jlcpcb-ready/jlcpcb-cpl.csv
#    Total components: 72

# 2. Add LCSC numbers from project BOM documentation
python3 add_lcsc_numbers.py \
  jlcpcb-ready/jlcpcb-bom.csv \
  --map parts_mapping.json \
  --filter-test-points \
  --output jlcpcb-ready/jlcpcb-bom-with-lcsc.csv

# Output:
# ✅ Updated BOM saved to: jlcpcb-ready/jlcpcb-bom-with-lcsc.csv
#    Total components: 38
#    With LCSC part #: 38
#    Missing part #: 0

# 3. Ready for JLCPCB upload!
```

## Troubleshooting

### BOM Upload Fails

- Check CSV format (no special characters in designators)
- Verify LCSC part numbers are valid (all start with 'C')
- Ensure all required fields are present

### CPL Upload Fails

- Verify coordinate format (must include "mm" suffix)
- Check rotation values (must be 0-360)
- Ensure Layer field is "Top" or "Bottom" (capitalized)

### Components Don't Match

- Some LCSC parts may be out of stock temporarily
- Check JLCPCB's suggested alternatives
- Use `jlcpcb-component-finder` skill to find replacements

### Wrong Coordinate System

If components appear in wrong locations:

- Verify Y-coordinates were negated (script does this automatically)
- Check KiCad board origin settings
- Ensure Gerber and CPL use same origin

## Notes

- JLCPCB may adjust placement coordinates based on their manufacturing process
- Board origin in KiCad affects coordinates - use "Drill/Place file origin" for consistency
- Some footprints may need renaming to match JLCPCB's library conventions
- Always verify the first assembly order carefully

## Integration with Other Skills

This skill works well with:

- **jlcpcb-component-finder**: Search JLCPCB database for LCSC part numbers
- **easyeda2kicad**: Download footprints/symbols for JLCPCB parts

Example workflow:
```
1. Use easyeda2kicad to download footprints from LCSC
2. Design PCB in KiCad
3. Use THIS skill to convert BOM/CPL
4. Use jlcpcb-component-finder to find missing LCSC numbers
5. Upload to JLCPCB for assembly
```
