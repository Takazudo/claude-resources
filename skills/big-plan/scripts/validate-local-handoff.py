#!/usr/bin/env python3
"""Validate and optionally repair a Claude big-plan local handoff."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


CANONICAL_FILE_RE = re.compile(r"sub-[0-9]{2}-[a-z0-9][a-z0-9-]*\.md")
SHORT_ID_RE = re.compile(r"sub-[0-9]{2}")
DEPENDENCY_LINE_RE = re.compile(r"^\*\*Depends on:\*\* (.*)$", re.MULTILINE)
EXECUTION_LINE_RE = re.compile(
    r"^\*\*Execution mode:\*\* (subagents|teams) — (\S.*)$", re.MULTILINE
)
MODEL_LINE_RE = re.compile(
    r"^\*\*Model:\*\* (fable|opus|sonnet|haiku) — (\S.*)$", re.MULTILINE
)
WAVE_LINE_RE = re.compile(r"^\*\*Wave:\*\* \S.*$", re.MULTILINE)
RAW_SKIP_RE = re.compile(r"^\*\*SKIP:\*\*.*$", re.MULTILINE)
SKIP_RE = re.compile(r"^\*\*SKIP:\*\* (\S.*)$", re.MULTILINE)


def split_list(value: str) -> tuple[str, ...] | None:
    if value == "none":
        return ()
    items = tuple(value.split(", "))
    if not items or ", ".join(items) != value:
        return None
    return items


def graph_errors(graph: dict[str, tuple[str, ...]]) -> list[str]:
    errors: list[str] = []
    for topic, dependencies in graph.items():
        if len(set(dependencies)) != len(dependencies):
            errors.append(f"{topic}: duplicate dependency edge")
        for dependency in dependencies:
            if dependency == topic:
                errors.append(f"{topic}: self-dependency")
            elif dependency not in graph:
                errors.append(f"{topic}: missing sibling {dependency}")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(topic: str) -> None:
        if topic in visiting:
            errors.append(f"cycle through {topic}")
            return
        if topic in visited or topic not in graph:
            return
        visiting.add(topic)
        for dependency in graph[topic]:
            visit(dependency)
        visiting.remove(topic)
        visited.add(topic)

    for topic in graph:
        visit(topic)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_dir", type=Path)
    parser.add_argument(
        "--repair",
        action="store_true",
        help="rewrite uniquely resolvable legacy sub-NN dependency IDs",
    )
    args = parser.parse_args()

    plan_dir = args.plan_dir.expanduser().resolve()
    errors: list[str] = []
    if not plan_dir.is_dir():
        print(f"error: not a directory: {plan_dir}", file=sys.stderr)
        return 1
    if not (plan_dir / "plan.md").is_file():
        errors.append("missing plan.md")

    paths = sorted(plan_dir.glob("sub-*.md"))
    if not paths:
        errors.append("no sub-NN-<slug>.md files")

    by_short_id: dict[str, list[str]] = {}
    for path in paths:
        if CANONICAL_FILE_RE.fullmatch(path.name) is None:
            errors.append(f"{path.name}: non-canonical filename")
            continue
        short_id = path.name[:6]
        by_short_id.setdefault(short_id, []).append(path.name)
    for short_id, names in by_short_id.items():
        if len(names) != 1:
            errors.append(f"{short_id}: ambiguous sibling filenames {names}")

    graph: dict[str, tuple[str, ...]] = {}
    rewritten: dict[Path, str] = {}
    for path in paths:
        body = path.read_text(encoding="utf-8")
        dependency_lines = DEPENDENCY_LINE_RE.findall(body)
        if len(dependency_lines) != 1:
            errors.append(
                f"{path.name}: expected exactly one bold dependency marker; "
                f"found {dependency_lines!r}"
            )
            continue
        if len(EXECUTION_LINE_RE.findall(body)) != 1:
            errors.append(f"{path.name}: expected one valid Claude execution marker")
        if len(MODEL_LINE_RE.findall(body)) != 1:
            errors.append(f"{path.name}: expected one valid Claude model marker")
        if len(WAVE_LINE_RE.findall(body)) != 1:
            errors.append(f"{path.name}: expected one Wave marker")
        raw_skip = RAW_SKIP_RE.findall(body)
        if len(raw_skip) > 1 or len(SKIP_RE.findall(body)) != len(raw_skip):
            errors.append(f"{path.name}: malformed or duplicate SKIP marker")

        items = split_list(dependency_lines[0])
        if items is None:
            errors.append(f"{path.name}: malformed dependency list {dependency_lines[0]!r}")
            continue

        canonical: list[str] = []
        for item in items:
            if CANONICAL_FILE_RE.fullmatch(item):
                canonical.append(item)
                continue
            if SHORT_ID_RE.fullmatch(item) and args.repair:
                matches = by_short_id.get(item, [])
                if len(matches) == 1:
                    canonical.append(matches[0])
                    continue
                errors.append(f"{path.name}: {item} does not resolve uniquely: {matches}")
                continue
            if SHORT_ID_RE.fullmatch(item):
                errors.append(
                    f"{path.name}: legacy short dependency {item}; rerun with --repair"
                )
            else:
                errors.append(f"{path.name}: invalid dependency {item!r}")

        canonical_tuple = tuple(canonical)
        graph[path.name] = canonical_tuple
        canonical_value = "none" if not canonical_tuple else ", ".join(canonical_tuple)
        if canonical_value != dependency_lines[0]:
            rewritten[path] = DEPENDENCY_LINE_RE.sub(
                f"**Depends on:** {canonical_value}", body, count=1
            )

    errors.extend(graph_errors(graph))
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    if args.repair:
        for path, body in rewritten.items():
            path.write_text(body, encoding="utf-8")
            print(f"repaired: {path.name}")
    elif rewritten:
        print("error: repairable legacy dependencies remain", file=sys.stderr)
        return 1

    print(f"valid local handoff: {len(paths)} topics, {len(rewritten)} repaired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
