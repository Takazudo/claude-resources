#!/usr/bin/env python3
"""Add LCSC part numbers to JLCPCB BOM.

This script helps you add LCSC part numbers to a converted JLCPCB BOM.
You can provide a mapping file or use interactive mode.

Usage:
    # With mapping file
    python add_lcsc_numbers.py <input_bom.csv> --map parts_mapping.json --output output.csv

    # Interactive mode (prompts for each missing part)
    python add_lcsc_numbers.py <input_bom.csv> --interactive

    # Just filter out test points
    python add_lcsc_numbers.py <input_bom.csv> --filter-test-points
"""

import csv
import json
import sys
import argparse
from pathlib import Path

def load_part_mapping(mapping_file):
    """Load LCSC part mapping from JSON file."""
    with open(mapping_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def filter_test_points(rows):
    """Filter out test points and other non-assembly components."""
    excluded_prefixes = ('TP', 'H', 'MH')
    excluded_comments = ['+15V USB-PD', 'GND', '+13.5V', '+7.5V', '-13.5V', '+5V', '+12V', '-12V']

    filtered = []
    for row in rows:
        designators = row['Designator'].split(',')[0].strip()
        comment = row['Comment']

        # Skip if designator starts with excluded prefix
        if any(designators.startswith(p) for p in excluded_prefixes):
            continue

        # Skip if comment is a test point label
        if comment in excluded_comments:
            continue

        filtered.append(row)

    return filtered

def add_lcsc_numbers_from_mapping(input_path, output_path, mapping, filter_tp=True):
    """Add LCSC part numbers using a mapping dictionary."""
    rows = []

    with open(input_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            comment = row['Comment']

            # Get LCSC part number from mapping
            lcsc_part = mapping.get(comment, '')
            row['JLCPCB Part #'] = lcsc_part
            rows.append(row)

    # Filter test points if requested
    if filter_tp:
        rows = filter_test_points(rows)

    # Write updated BOM
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Comment', 'Designator', 'Footprint', 'JLCPCB Part #'])
        writer.writeheader()
        writer.writerows(rows)

    # Report
    total = len(rows)
    with_part = sum(1 for r in rows if r['JLCPCB Part #'])
    missing = total - with_part

    print(f"✅ Updated BOM saved to: {output_path}")
    print(f"   Total components: {total}")
    print(f"   With LCSC part #: {with_part}")
    print(f"   Missing part #: {missing}")

    if missing > 0:
        print(f"\n⚠️  Components missing LCSC part numbers:")
        for row in rows:
            if not row['JLCPCB Part #']:
                print(f"   - {row['Comment']} ({row['Designator']})")
                print(f"     Footprint: {row['Footprint']}")

def interactive_mode(input_path, output_path):
    """Interactive mode to add LCSC numbers."""
    print("🔍 Interactive mode: Enter LCSC part numbers for each component")
    print("   (Press Enter to skip, type 'quit' to exit)\n")

    rows = []
    with open(input_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row['JLCPCB Part #']:
                print(f"Component: {row['Comment']}")
                print(f"Designator: {row['Designator']}")
                print(f"Footprint: {row['Footprint']}")
                lcsc_part = input("LCSC Part # (C-prefix): ").strip()

                if lcsc_part.lower() == 'quit':
                    break

                row['JLCPCB Part #'] = lcsc_part
                print()

            rows.append(row)

    # Write updated BOM
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Comment', 'Designator', 'Footprint', 'JLCPCB Part #'])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Updated BOM saved to: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Add LCSC part numbers to JLCPCB BOM')
    parser.add_argument('input', help='Input BOM CSV file')
    parser.add_argument('--map', help='JSON mapping file (Comment -> LCSC Part #)')
    parser.add_argument('--output', '-o', help='Output CSV file (default: input_with_lcsc.csv)')
    parser.add_argument('--interactive', '-i', action='store_true', help='Interactive mode')
    parser.add_argument('--filter-test-points', '-f', action='store_true', help='Filter out test points')

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.parent / f"{input_path.stem}_with_lcsc.csv"

    if args.interactive:
        interactive_mode(input_path, output_path)
    elif args.map:
        mapping = load_part_mapping(args.map)
        add_lcsc_numbers_from_mapping(input_path, output_path, mapping, args.filter_test_points)
    else:
        # Just filter test points
        if args.filter_test_points:
            rows = []
            with open(input_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            rows = filter_test_points(rows)

            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['Comment', 'Designator', 'Footprint', 'JLCPCB Part #'])
                writer.writeheader()
                writer.writerows(rows)

            print(f"✅ Filtered BOM saved to: {output_path}")
            print(f"   Components after filtering: {len(rows)}")
        else:
            print("Error: Provide --map, --interactive, or --filter-test-points")
            sys.exit(1)

if __name__ == '__main__':
    main()
