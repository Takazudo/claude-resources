# JLCPCB BOM/CPL Conversion Scripts

Python scripts for converting KiCad exports to JLCPCB format.

## Scripts

### 1. convert_to_jlcpcb.py
Main conversion script - converts KiCad BOM and position files to JLCPCB format.

**Usage:**
```bash
python3 convert_to_jlcpcb.py <bom.csv> <top.pos> [bottom.pos] [output_dir]
```

**Examples:**
```bash
# Top and bottom sides
python3 convert_to_jlcpcb.py bom.csv top.pos bottom.pos output/

# Top side only
python3 convert_to_jlcpcb.py bom.csv top.pos output/

# Default output directory
python3 convert_to_jlcpcb.py bom.csv top.pos bottom.pos
# Creates ./jlcpcb-output/
```

**Output:**
- `jlcpcb-bom.csv` - BOM without LCSC numbers (needs Step 2)
- `jlcpcb-cpl.csv` - CPL ready for upload

### 2. add_lcsc_numbers.py
Add LCSC part numbers to converted BOM.

**Usage:**
```bash
# Interactive mode (prompts for each part)
python3 add_lcsc_numbers.py <input.csv> --interactive

# With mapping file
python3 add_lcsc_numbers.py <input.csv> --map parts_mapping.json

# Filter test points only
python3 add_lcsc_numbers.py <input.csv> --filter-test-points

# Combine options
python3 add_lcsc_numbers.py <input.csv> --map parts.json --filter-test-points -o output.csv
```

**Options:**
- `--map FILE` - JSON mapping file (Comment → LCSC Part #)
- `--interactive` - Prompt for each missing part number
- `--filter-test-points` - Remove test points (TP*, H*, MH*)
- `--output FILE` - Output file (default: input_with_lcsc.csv)

### 3. create_parts_mapping.py
Generate a JSON mapping template for LCSC part numbers.

**Usage:**
```bash
python3 create_parts_mapping.py --output parts_mapping.json
```

**Output:** JSON file you can edit:
```json
{
  "LM7805ABD2T-TR": "C86206",
  "10k": "C25804",
  "100nF": "C49678",
  ...
}
```

## Full Workflow

```bash
# Step 1: Convert KiCad exports
python3 convert_to_jlcpcb.py \
  dist/bom.csv \
  dist/top.pos \
  dist/bottom.pos \
  dist/jlcpcb-ready/

# Step 2A: Interactive mode (for first-time users)
python3 add_lcsc_numbers.py \
  dist/jlcpcb-ready/jlcpcb-bom.csv \
  --interactive

# OR

# Step 2B: Create and use mapping file (for repeated orders)
python3 create_parts_mapping.py -o parts.json
# Edit parts.json with your LCSC numbers
python3 add_lcsc_numbers.py \
  dist/jlcpcb-ready/jlcpcb-bom.csv \
  --map parts.json \
  --filter-test-points \
  --output dist/jlcpcb-ready/jlcpcb-bom-final.csv
```

## Requirements

- Python 3.6+
- No external dependencies (uses standard library only)

## File Formats

### Input: KiCad BOM CSV (semicolon-delimited)
```
"Id";"Designator";"Footprint";"Quantity";"Designation";"Supplier and ref";
1;"U6";"TO-263-2";1;"L7812CD2T-TR";;;
```

### Input: KiCad Position File
```
# Ref     Val        Package    PosX       PosY       Rot  Side
C1        10uF       C1206      46.7500   -12.4325  180.0000  top
```

### Output: JLCPCB BOM CSV
```
Comment,Designator,Footprint,JLCPCB Part #
L7812CD2T-TR,U6,TO-263-2,C13456
```

### Output: JLCPCB CPL CSV
```
Designator,Mid X,Mid Y,Layer,Rotation
C1,46.7500mm,12.4325mm,Top,180
```

## Coordinate Transformation

**Critical:** Y-coordinates are automatically negated because KiCad and JLCPCB use different coordinate systems:
- KiCad: Negative Y goes down
- JLCPCB: Positive Y goes down

The script handles this automatically.

## Component Filtering

Test points and mounting holes are commonly excluded from JLCPCB assembly:
- Designators: TP*, H*, MH*
- Comments: "GND", "+5V", "+12V", etc.

Use `--filter-test-points` flag to auto-remove these.

## Tips

1. **First order:** Use interactive mode to learn part numbers
2. **Repeated orders:** Save mappings to JSON for reuse
3. **Stock checking:** Use `jlcpcb-component-finder` skill for availability
4. **Verification:** Always review in JLCPCB's placement viewer

## Troubleshooting

**"No such file or directory"**
- Use absolute paths or run from correct directory
- Check file extensions (.csv, .pos)

**"Missing LCSC part numbers"**
- Run with `--interactive` to add manually
- Or create mapping file with `create_parts_mapping.py`

**"CPL upload fails"**
- Verify coordinates include "mm" suffix (script adds automatically)
- Check rotation values are 0-360 (script normalizes automatically)

**"Components in wrong location"**
- Verify Gerber and CPL use same origin
- Check KiCad board origin settings
- Ensure Y-coordinates were negated (script does this)
