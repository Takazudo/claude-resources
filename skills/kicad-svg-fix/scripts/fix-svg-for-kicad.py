#!/usr/bin/env python3
"""Fix SVG files for KiCad import.

Solves three common problems with Illustrator SVG → KiCad:
1. Compound paths (shapes with holes) → split into separate <path> elements
2. Scale correction (Illustrator 72 DPI vs KiCad 96 DPI)
3. Strip CSS styles/defs that KiCad ignores, add stroke attributes

Usage:
    python fix-svg-for-kicad.py input.svg [output.svg] [--scale FACTOR]
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

DEFAULT_SCALE = 1.33350873  # Illustrator 72dpi → KiCad 96dpi empirical factor

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def split_subpaths(d_attr):
    """Split compound path d attribute into list of individual subpath strings.

    A compound path like "M0,0...ZM10,10...Z" becomes ["M0,0...Z", "M10,10...Z"].
    """
    d = d_attr.strip()
    if not d:
        return []

    # Split before each M/m that starts a new subpath (but not the very first one)
    # Pattern: find positions where M/m appears after content
    subpaths = []
    current = ""

    # Tokenize: split on M/m boundaries
    parts = re.split(r"(?=[Mm])", d)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # If current subpath ends with Z/z and this is a new M, start new subpath
        if current and re.search(r"[Zz]\s*$", current) and re.match(r"[Mm]", part):
            subpaths.append(current.strip())
            current = part
        else:
            current += part
    if current.strip():
        subpaths.append(current.strip())

    return subpaths


def scale_path_data(d_attr, factor):
    """Scale all coordinate values in SVG path d attribute.

    Handles M, L, H, V, C, S, Q, T, Z commands (absolute and relative).
    Arc (A/a) commands: scales radii and endpoint, preserves flags and angle.
    """
    if factor == 1.0:
        return d_attr

    tokens = re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?", d_attr
    )

    result = []
    i = 0

    def scale_num(s):
        return str(round(float(s) * factor, 4))

    def is_number(s):
        try:
            float(s)
            return True
        except (ValueError, TypeError):
            return False

    def is_command(s):
        return len(s) == 1 and s.isalpha()

    while i < len(tokens):
        token = tokens[i]

        if token in "Zz":
            result.append(token)
            i += 1
        elif token in "Aa":
            # Arc: rx ry x-rotation large-arc-flag sweep-flag x y
            result.append(token)
            i += 1
            while i < len(tokens) and not is_command(tokens[i]):
                # rx (scale)
                result.append(scale_num(tokens[i]))
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # ry (scale)
                result.append(scale_num(tokens[i]))
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # x-rotation (preserve - it's degrees)
                result.append(tokens[i])
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # large-arc-flag (preserve)
                result.append(tokens[i])
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # sweep-flag (preserve)
                result.append(tokens[i])
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # x (scale)
                result.append(scale_num(tokens[i]))
                i += 1
                if i >= len(tokens) or is_command(tokens[i]):
                    break
                # y (scale)
                result.append(scale_num(tokens[i]))
                i += 1
        elif is_command(token):
            # All other commands: scale every number
            result.append(token)
            i += 1
            while i < len(tokens) and not is_command(tokens[i]):
                result.append(scale_num(tokens[i]))
                i += 1
        elif is_number(token):
            # Implicit command continuation (numbers without preceding command)
            result.append(scale_num(token))
            i += 1
        else:
            result.append(token)
            i += 1

    return " ".join(result)


def fix_svg(input_path, output_path, scale_factor):
    """Process SVG: split compound paths, scale, clean up for KiCad."""
    tree = ET.parse(input_path)
    root = tree.getroot()

    # Remove defs (contains styles KiCad ignores)
    for defs in root.findall(f"{{{SVG_NS}}}defs"):
        root.remove(defs)

    # Collect all path elements
    paths_to_process = []
    for parent in root.iter():
        for child in list(parent):
            tag = child.tag.replace(f"{{{SVG_NS}}}", "")
            if tag == "path":
                paths_to_process.append((parent, child))

    for parent, path_elem in paths_to_process:
        d = path_elem.get("d", "")
        subpaths = split_subpaths(d)

        if len(subpaths) <= 1:
            # Single path — just scale and clean
            if d:
                path_elem.set("d", scale_path_data(d, scale_factor))
            _clean_path_attrs(path_elem)
        else:
            # Compound path — split into separate elements
            idx = list(parent).index(path_elem)
            parent.remove(path_elem)

            for j, subpath_d in enumerate(subpaths):
                new_path = ET.SubElement(parent, f"{{{SVG_NS}}}path")
                new_path.set("d", scale_path_data(subpath_d, scale_factor))
                _clean_path_attrs(new_path)
                # Maintain order
                parent.remove(new_path)
                parent.insert(idx + j, new_path)

    # Scale viewBox if present
    viewbox = root.get("viewBox")
    if viewbox and scale_factor != 1.0:
        parts = viewbox.split()
        if len(parts) == 4:
            scaled = [str(round(float(v) * scale_factor, 4)) for v in parts]
            root.set("viewBox", " ".join(scaled))

    # Scale width/height if present
    for attr in ("width", "height"):
        val = root.get(attr)
        if val:
            num = re.match(r"(-?\d*\.?\d+)(.*)", val)
            if num:
                scaled_val = round(float(num.group(1)) * scale_factor, 4)
                root.set(attr, f"{scaled_val}{num.group(2)}")

    tree.write(output_path, xml_declaration=True, encoding="UTF-8")
    print(f"Fixed SVG written to: {output_path}")
    print(f"  Scale factor: {scale_factor}")
    print(f"  Paths split: {sum(len(split_subpaths(p.get('d',''))) for _, p in paths_to_process if len(split_subpaths(p.get('d',''))) > 1)} compound → separate")


def _clean_path_attrs(elem):
    """Remove CSS class, add KiCad-friendly stroke attributes."""
    # Remove class attribute
    if "class" in elem.attrib:
        del elem.attrib["class"]
    # Remove style attribute
    if "style" in elem.attrib:
        del elem.attrib["style"]
    # Set stroke for visibility in KiCad, no fill
    elem.set("fill", "none")
    elem.set("stroke", "black")
    elem.set("stroke-width", "0.1")


def main():
    parser = argparse.ArgumentParser(description="Fix SVG for KiCad import")
    parser.add_argument("input", help="Input SVG file")
    parser.add_argument("output", nargs="?", help="Output SVG file (default: input-fixed.svg)")
    parser.add_argument(
        "--scale",
        type=float,
        default=DEFAULT_SCALE,
        help=f"Scale factor (default: {DEFAULT_SCALE}, Illustrator 72dpi→96dpi)",
    )
    parser.add_argument(
        "--no-scale",
        action="store_true",
        help="Skip scaling (only split compound paths and clean up)",
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} not found", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(input_path.stem + "-fixed")

    scale = 1.0 if args.no_scale else args.scale
    fix_svg(str(input_path), str(output_path), scale)


if __name__ == "__main__":
    main()
