#!/usr/bin/env python3
"""Combine multiple PDF files into one using PyMuPDF (fitz)."""

import argparse
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not installed. Install with: pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)


def get_pdf_files_from_dir(dir_path: Path) -> list[Path]:
    """Get PDF files from directory, sorted by name."""
    pdf_files = sorted(dir_path.glob("*.pdf"), key=lambda p: p.name.lower())
    if not pdf_files:
        print(f"Error: No PDF files found in {dir_path}", file=sys.stderr)
        sys.exit(1)
    return pdf_files


def combine_pdfs(input_files: list[Path], output_file: Path) -> None:
    """Combine multiple PDF files into one."""
    output_doc = fitz.open()

    for pdf_path in input_files:
        if not pdf_path.exists():
            print(f"Error: File not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        if not pdf_path.suffix.lower() == ".pdf":
            print(f"Warning: Skipping non-PDF file: {pdf_path}", file=sys.stderr)
            continue

        try:
            doc = fitz.open(pdf_path)
            page_count = doc.page_count
            output_doc.insert_pdf(doc)
            doc.close()
            print(f"Added: {pdf_path} ({page_count} pages)")
        except Exception as e:
            print(f"Error reading {pdf_path}: {e}", file=sys.stderr)
            sys.exit(1)

    if output_doc.page_count == 0:
        print("Error: No pages to combine", file=sys.stderr)
        sys.exit(1)

    total_pages = output_doc.page_count
    output_doc.save(output_file)
    output_doc.close()
    print(f"\nCombined PDF saved to: {output_file}")
    print(f"Total pages: {total_pages}")


def main():
    parser = argparse.ArgumentParser(description="Combine PDF files into one")
    parser.add_argument(
        "inputs",
        nargs="+",
        help="PDF files or directory containing PDFs to combine"
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="Output PDF file path"
    )

    args = parser.parse_args()

    input_paths = [Path(p) for p in args.inputs]
    output_path = Path(args.output)

    # If single input is a directory, get all PDFs from it
    if len(input_paths) == 1 and input_paths[0].is_dir():
        pdf_files = get_pdf_files_from_dir(input_paths[0])
        print(f"Found {len(pdf_files)} PDF files in {input_paths[0]}:")
        for f in pdf_files:
            print(f"  - {f.name}")
        print()
    else:
        # Use files in the order provided
        pdf_files = input_paths

    combine_pdfs(pdf_files, output_path)


if __name__ == "__main__":
    main()
