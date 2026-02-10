#!/usr/bin/env python3
"""Create a parts mapping template JSON file from BOM documentation.

This script helps you create a JSON mapping file for LCSC part numbers.
You can edit this file and use it with add_lcsc_numbers.py.

Usage:
    python create_parts_mapping.py --output parts_mapping.json
"""

import json
import sys
import argparse

# Example mapping template
EXAMPLE_MAPPING = {
    "# STAGE 1: USB-PD": None,
    "STUSB4500QTR": "C2678061",
    "-30V -4A": "C347476",  # AO3401A (Q1)
    "USB-C": "C456012",
    "USBLC6-2SC6": "C7519",
    "10uF": "C7432781",
    "1uF 16V": "C6119849",
    "100k": "C14675",
    "56k": "C23168",
    "470": "C23162",

    "# STAGE 2: DC-DC": None,
    "LM2596S-ADJ": "C347423",
    "100uH": "C19268674",
    "SS34": "C8678",
    "10k": "C25804",
    "1k": "C21190",  # 0603
    "5.1k": "C23186",
    "470uF 25V": "C2983319",
    "470uF 16V": "C46550400",
    "100uF": "C22383804",
    "22nF": "C1710",

    "# STAGE 3: Linear Regulators": None,
    "L7812CD2T-TR": "C13456",
    "L7805ABD2T-TR": "C86206",
    "CJ7912_C94173": "C94173",
    "470nF": "C1623",
    "470uF": "C2992611",
    "100nF": "C49678",  # 0805
    "100nF 50V": "C49678",

    "# STAGE 4: Protection": None,
    "BSMD1206-150-16V": "C883133",
    "SMD1210P200TF": "C20808",
    "mSMD110-33V": "C70119",
    "SMAJ15A_C571368": "C571368",
    "SD05_C502527": "C502527",
    "Green": "C19171392",
    "Blue": "C5382145",
    "Red": "C2286",

    "# STAGE 5: Connectors": None,
    "1217754-1": "C305825",
    "2541WR-2X08P": "C5383092",

    "# RESISTORS (package-specific)": None,
    "1k_0805": "C25623",  # R7, R8, R9
}

def create_mapping_file(output_path):
    """Create a JSON mapping file with example data."""
    # Remove comment entries (keys starting with #)
    clean_mapping = {k: v for k, v in EXAMPLE_MAPPING.items() if not k.startswith('#')}

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(clean_mapping, f, indent=2, ensure_ascii=False)

    print(f"✅ Created parts mapping template: {output_path}")
    print(f"   Total entries: {len(clean_mapping)}")
    print(f"\n📝 Edit this file to add your LCSC part numbers:")
    print(f"   {{")
    print(f'     "Component_Name": "C12345",')
    print(f'     "LM7805ABD2T-TR": "C86206",')
    print(f'     ...')
    print(f"   }}")
    print(f"\n💡 Then use with: python add_lcsc_numbers.py bom.csv --map {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Create LCSC parts mapping template')
    parser.add_argument('--output', '-o', default='parts_mapping.json',
                       help='Output JSON file (default: parts_mapping.json)')

    args = parser.parse_args()
    create_mapping_file(args.output)

if __name__ == '__main__':
    main()
