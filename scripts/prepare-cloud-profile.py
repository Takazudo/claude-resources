#!/usr/bin/env python3
"""Prepare a fresh Claude cloud profile from a local canonical checkout."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    source = args.source.expanduser().absolute()
    install_args = ["--home", str(args.home.expanduser().absolute())]
    # A cached export can predate the checkout after a prepared image is restored.
    with tempfile.TemporaryDirectory(prefix="claude-profile-prepare-") as stage:
        bundle = Path(stage).resolve() / "export"
        subprocess.run([
            sys.executable, str(source / "scripts/export-cloud-profile.py"),
            "--source", str(source), "--output", str(bundle),
        ], check=True)
        provenance = json.loads((bundle / "cloud-profile-provenance.json").read_text())
        print(f"Preparing claude revision {provenance['source_revision']} "
              f"(tracked_dirty={provenance['tracked_dirty']})", flush=True)
        command = [sys.executable, str(bundle / "scripts/install-cloud-profile.py"),
                   "--source", str(bundle), *install_args]
        subprocess.run(command, check=True)
        subprocess.run([*command, "--check"], check=True)
    print("Prepared and checked. Host publication and native loading are separate checks.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
