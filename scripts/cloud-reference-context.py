#!/usr/bin/env python3
"""Restore the installed Claude profile and emit references for Codex ccref."""

import argparse
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    home = args.home.expanduser().absolute()
    profile = home / ".claude"
    command = [sys.executable, str(profile / "scripts/install-cloud-profile.py"),
               "--installed", "--home", str(home)]
    for extra in ([], ["--check"]):
        subprocess.run(command + extra, check=True, stdout=sys.stderr)

    instructions = profile / "CLAUDE.md"
    sections = [
        "# Claude references for ccref\n\n"
        "Use these as references through ccref; adapt Claude-specific mechanics to\n"
        "Codex and follow the host instruction hierarchy. Native Claude loading is\n"
        "not required. Read selected SKILL.md bodies on demand; do not execute them\n"
        "as a startup check.\n",
        f"## Source: {instructions}\nResolved: {instructions.resolve(strict=True)}\n\n"
        + instructions.read_text(encoding="utf-8"),
        "## Verified workflow references\n",
    ]
    for name in ("big-plan", "x", "x-wt-teams"):
        path = profile / "skills" / name / "SKILL.md"
        # Read the whole document to verify access, but do not load workflow bodies.
        path.read_text(encoding="utf-8")
        sections.append(f"- {name}: {path} (resolved: {path.resolve(strict=True)})")
    print("\n".join(sections))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Claude reference startup failed: {exc}", file=sys.stderr)
        sys.exit(1)
