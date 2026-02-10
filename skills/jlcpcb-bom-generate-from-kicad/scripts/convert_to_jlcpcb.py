#!/usr/bin/env python3
"""Convert KiCad BOM and position files to JLCPCB format.

Usage:
    python convert_to_jlcpcb.py <bom.csv> <top.pos> [bottom.pos] [output_dir]

Examples:
    # Convert with top and bottom sides
    python convert_to_jlcpcb.py bom.csv top.pos bottom.pos output/

    # Convert top side only
    python convert_to_jlcpcb.py bom.csv top.pos output/
"""

import csv
import re
from pathlib import Path
import sys

def convert_bom(kicad_bom_path, output_path):
    """Convert KiCad BOM to JLCPCB format."""
    rows = []

    with open(kicad_bom_path, 'r', encoding='utf-8') as f:
        # KiCad BOM uses semicolon delimiter
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            # Skip empty rows
            if not row.get('Designator'):
                continue

            # Sort designators alphanumerically
            designators = row['Designator'].strip('"').split(',')
            designators = sorted(designators, key=lambda x: (
                re.match(r'^([A-Za-z]+)', x).group(1) if re.match(r'^([A-Za-z]+)', x) else '',
                int(re.search(r'(\d+)', x).group(1)) if re.search(r'(\d+)', x) else 0
            ))

            rows.append({
                'Comment': row.get('Designation', '').strip('"'),
                'Designator': ','.join(designators),
                'Footprint': row.get('Footprint', '').strip('"'),
                'JLCPCB Part #': ''  # To be filled manually or via add_lcsc_numbers.py
            })

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Comment', 'Designator', 'Footprint', 'JLCPCB Part #'])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Converted BOM saved to: {output_path}")
    print(f"   Total components: {len(rows)}")
    return rows

def convert_cpl(kicad_pos_paths, output_path):
    """Convert KiCad position files to JLCPCB CPL format.

    Args:
        kicad_pos_paths: List of .pos file paths (top and/or bottom)
        output_path: Output CSV path
    """
    rows = []

    for pos_path in kicad_pos_paths:
        print(f"📄 Processing: {pos_path}")
        with open(pos_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        for line in lines:
            # Skip comments and header
            if line.startswith('#') or line.startswith('##') or not line.strip():
                continue

            parts = line.split()
            if len(parts) < 7:
                continue

            ref = parts[0]
            pos_x = float(parts[3])
            pos_y = float(parts[4])
            rotation = float(parts[5])
            side = parts[6]

            # Apply transformations
            mid_y = -pos_y  # Negate Y coordinate for JLCPCB
            if rotation < 0:
                rotation = rotation + 360  # Normalize negative rotation

            rows.append({
                'Designator': ref,
                'Mid X': f"{pos_x:.4f}mm",
                'Mid Y': f"{mid_y:.4f}mm",
                'Layer': side.capitalize(),
                'Rotation': int(rotation) if rotation == int(rotation) else rotation
            })

    # Sort by designator
    rows.sort(key=lambda x: (
        re.match(r'^([A-Za-z]+)', x['Designator']).group(1) if re.match(r'^([A-Za-z]+)', x['Designator']) else '',
        int(re.search(r'(\d+)', x['Designator']).group(1)) if re.search(r'(\d+)', x['Designator']) else 0
    ))

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Converted CPL saved to: {output_path}")
    print(f"   Total components: {len(rows)}")
    return rows

def main():
    if len(sys.argv) < 3:
        print("Usage: python convert_to_jlcpcb.py <bom.csv> <top.pos> [bottom.pos] [output_dir]")
        sys.exit(1)

    # Parse arguments
    bom_path = sys.argv[1]
    pos_top = sys.argv[2]
    pos_bottom = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3].endswith('.pos') else None
    output_dir = sys.argv[4] if len(sys.argv) > 4 else (sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].endswith('.pos') else './jlcpcb-output')

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print("🔄 Converting KiCad exports to JLCPCB format...\n")

    # Convert BOM
    bom_output = output_path / 'jlcpcb-bom.csv'
    convert_bom(bom_path, bom_output)
    print()

    # Convert CPL
    pos_files = [pos_top]
    if pos_bottom:
        pos_files.append(pos_bottom)

    cpl_output = output_path / 'jlcpcb-cpl.csv'
    convert_cpl(pos_files, cpl_output)
    print()

    print("✨ Conversion complete!")
    print(f"\n📁 Output files:")
    print(f"   - BOM: {bom_output}")
    print(f"   - CPL: {cpl_output}")
    print(f"\n⚠️  Next step: Add JLCPCB Part # (LCSC numbers) using add_lcsc_numbers.py")

if __name__ == '__main__':
    main()
