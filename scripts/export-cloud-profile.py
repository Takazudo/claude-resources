#!/usr/bin/env python3
"""Export the Git-tracked Claude profile as a self-contained bundle.

Usage: export-cloud-profile.py [--source REPO_ROOT] --output NEW_DIR

Roots: CLAUDE.md, skills/ and scripts/ are required; web/, commands/, agents/,
docs/cloud-bootstrap.md and README.md are exported when tracked. settings.json,
hooks/, .claude/, .husky/ and package files are never exported, and untracked or
gitignored files (for example the local-only wisdom skills) are absent.

The bundle is a directory with cloud-profile-provenance.json at its root plus
the exported roots. Consumers recognise a bundle only by that file. Shape:

  {
    "format_version": 1,
    "source_revision": "<git HEAD sha>",
    "tracked_dirty": <true if any tracked file is modified>,
    "tracked_status": ["<git status --porcelain=v1 line>", ...],
    "files": [{"path": "<posix relpath>", "sha256": "<hex>", "mode": "0644"}, ...]
  }

mode is a 4-digit octal string of the preserved permission bits. The manifest
does not list or hash itself.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile


MANIFEST_NAME = "cloud-profile-provenance.json"
REQUIRED_FILES = ("CLAUDE.md",)
REQUIRED_PREFIXES = ("skills/", "scripts/")
OPTIONAL_FILES = {"README.md", "docs/cloud-bootstrap.md"}
OPTIONAL_PREFIXES = ("web/", "commands/", "agents/")


class ExportError(ValueError):
    """The source tree or destination is unsafe or incomplete."""


def absolute_path(path):
    """Return an absolute lexical path without resolving symlinks."""
    expanded = Path(path).expanduser()
    if not expanded.is_absolute():
        expanded = Path.cwd() / expanded
    return Path(os.path.abspath(expanded))


def reject_symlinked_ancestors(path, *, include_leaf=True, allow_missing=False):
    """Check path components with lstat so path validation never follows links."""
    candidates = list(reversed(path.parents))
    if include_leaf:
        candidates.append(path)
    for candidate in candidates:
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            if allow_missing:
                continue
            raise ExportError(f"path component does not exist: {candidate}") from None
        if stat.S_ISLNK(info.st_mode):
            raise ExportError(f"symlinked path component is not allowed: {candidate}")
        if candidate == path and include_leaf:
            continue
        if not stat.S_ISDIR(info.st_mode):
            raise ExportError(f"path component is not a directory: {candidate}")


def git(source, *args):
    result = subprocess.run(
        ["git", "-C", str(source), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def tracked_index(source):
    """Return index entries keyed by their repository-relative POSIX paths."""
    entries = {}
    output = git(source, "ls-files", "--stage", "-z")
    for record in output.split(b"\0"):
        if not record:
            continue
        try:
            metadata, raw_path = record.split(b"\t", 1)
            mode, _object_id, stage = metadata.split()
            relative = os.fsdecode(raw_path)
        except ValueError as exc:
            raise ExportError("could not parse the Git index") from exc
        entries.setdefault(relative, []).append((mode.decode("ascii"), stage.decode("ascii")))
    return entries


def is_canonical_path(relative):
    return (
        relative in set(REQUIRED_FILES) | OPTIONAL_FILES
        or relative.startswith(REQUIRED_PREFIXES + OPTIONAL_PREFIXES)
    )


def validate_relative_path(relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ExportError(f"unsafe tracked path: {relative!r}")
    if "\\" in relative or "\0" in relative:
        raise ExportError(f"unsupported tracked path: {relative!r}")


def source_file(source, relative, index_entries):
    """Validate one tracked regular file and return its bytes and actual mode."""
    validate_relative_path(relative)
    entries = index_entries.get(relative)
    if not entries:
        raise ExportError(f"required source file is not tracked: {relative}")
    if len(entries) != 1 or entries[0][1] != "0":
        raise ExportError(f"unmerged or multiply staged source path: {relative}")
    git_mode = entries[0][0]
    if git_mode not in {"100644", "100755"}:
        raise ExportError(f"tracked symlink or nonregular file is not allowed: {relative}")

    path = source
    parts = PurePosixPath(relative).parts
    for part in parts[:-1]:
        path = path / part
        try:
            info = path.lstat()
        except FileNotFoundError:
            raise ExportError(f"tracked source path is missing: {relative}") from None
        if stat.S_ISLNK(info.st_mode):
            raise ExportError(f"tracked source path traverses a symlink: {relative}")
        if not stat.S_ISDIR(info.st_mode):
            raise ExportError(f"tracked source parent is not a directory: {path}")

    path = path / parts[-1]
    try:
        info = path.lstat()
    except FileNotFoundError:
        raise ExportError(f"tracked source path is missing: {relative}") from None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ExportError(f"tracked symlink or nonregular file is not allowed: {relative}")
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise ExportError(f"cannot read tracked source file {relative}: {exc}") from exc
    return content, stat.S_IMODE(info.st_mode)


def destination_preflight(source, output):
    if output == source or source in output.parents or output in source.parents:
        raise ExportError("output must be outside the source checkout")
    if os.path.lexists(output):
        raise ExportError(f"output already exists; choose a new directory: {output}")
    reject_symlinked_ancestors(output, include_leaf=False, allow_missing=True)


def collect_files(source):
    index_entries = tracked_index(source)
    selected = sorted(path for path in index_entries if is_canonical_path(path))
    if not selected:
        raise ExportError("Git index contains no canonical profile files")
    missing = [relative for relative in REQUIRED_FILES if relative not in index_entries]
    if missing:
        raise ExportError("source is missing required tracked files: " + ", ".join(missing))
    for prefix in REQUIRED_PREFIXES:
        if not any(path.startswith(prefix) for path in selected):
            raise ExportError(f"source requires tracked files under {prefix}")

    files = []
    for relative in selected:
        content, mode = source_file(source, relative, index_entries)
        files.append(
            {
                "path": relative,
                "content": content,
                "mode": mode,
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    return files


def export(source, output):
    source = absolute_path(source)
    output = absolute_path(output)
    reject_symlinked_ancestors(source)
    if not source.is_dir():
        raise ExportError(f"source must be a directory: {source}")
    root = Path(os.fsdecode(git(source, "rev-parse", "--show-toplevel").strip()))
    root = absolute_path(root)
    if root != source:
        raise ExportError(f"source must be the Git repository root: {root}")

    destination_preflight(source, output)
    revision = git(source, "rev-parse", "HEAD").decode("ascii").strip()
    tracked_status = git(
        source, "status", "--porcelain=v1", "--untracked-files=no", "--no-renames"
    ).decode("utf-8", errors="replace").splitlines()
    files = collect_files(source)
    if not files:
        raise ExportError("no canonical files are available to export")

    # Catch a source checkout changed during preflight before writing anything.
    if git(source, "rev-parse", "HEAD").decode("ascii").strip() != revision:
        raise ExportError("source revision changed during export preflight")
    current_status = git(
        source, "status", "--porcelain=v1", "--untracked-files=no", "--no-renames"
    ).decode("utf-8", errors="replace").splitlines()
    if current_status != tracked_status:
        raise ExportError("tracked source status changed during export preflight")
    destination_preflight(source, output)

    output.parent.mkdir(parents=True, exist_ok=True)
    reject_symlinked_ancestors(output, include_leaf=False)
    if os.path.lexists(output):
        raise ExportError(f"output already exists; choose a new directory: {output}")
    stage = Path(tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=output.parent))
    try:
        for item in files:
            target = stage.joinpath(*PurePosixPath(item["path"]).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as stream:
                stream.write(item["content"])
            os.chmod(target, item["mode"])

        manifest = {
            "format_version": 1,
            "source_revision": revision,
            "tracked_dirty": bool(tracked_status),
            "tracked_status": tracked_status,
            "files": [
                {"path": item["path"], "sha256": item["sha256"], "mode": f"{item['mode']:04o}"}
                for item in files
            ],
        }
        manifest_path = stage / MANIFEST_NAME
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.chmod(manifest_path, 0o644)

        # Recheck the destination immediately before publishing the completed tree.
        destination_preflight(source, output)
        stage.rename(output)
    except Exception:
        if stage.exists():
            shutil.rmtree(stage)
        raise

    return len(files), revision, bool(tracked_status)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default_source = Path(os.path.abspath(__file__)).parent.parent
    parser.add_argument("--source", type=Path, default=default_source,
                        help="Git repository root (default: this script's repository)")
    parser.add_argument("--output", type=Path, required=True,
                        help="new directory to create with the tracked Claude profile")
    args = parser.parse_args(argv)
    try:
        count, revision, dirty = export(args.source, args.output)
    except (ExportError, OSError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "stderr", None)
        if isinstance(detail, bytes):
            detail = detail.decode("utf-8", errors="replace").strip()
        message = detail or str(exc) or "Git command failed"
        parser.exit(1, f"cloud-profile-export: {message}\n")
    print(f"Exported {count} tracked files to {absolute_path(args.output)}")
    print(f"Source revision: {revision}; tracked working tree: {'dirty' if dirty else 'clean'}")
    print(f"Provenance: {absolute_path(args.output) / MANIFEST_NAME}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
