#!/usr/bin/env python3
"""Scan a CodeGrid article for Claude Code skill-name mentions and report which
ones can be linked to the public claude-resources repo, pinned to the latest
commit hash.

Usage:
    scan.py <article.md> [--repo <path-to-claude-resources>]

Output is a concise report. It does NOT edit the article — applying the inline
links is left to Claude so editorial judgment (which mention to link) is kept.
"""

import argparse
import glob
import os
import re
import subprocess
import sys

SKILL_TOKEN = re.compile(r"/([a-z][a-z0-9-]*)")
FENCE = re.compile(r"^\s*(```+|~~~+)")


def sh(args, cwd=None):
    return subprocess.run(
        args, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


def resolve_repo(explicit):
    if explicit:
        return os.path.abspath(os.path.expanduser(explicit))
    matches = glob.glob(os.path.join(os.environ["HOME"], "repos", "*", "claude-resources"))
    if len(matches) == 1:
        return matches[0]
    if not matches:
        sys.exit("ERROR: claude-resources repo not found under $HOME/repos/*/. Pass --repo.")
    sys.exit("ERROR: multiple claude-resources matches: " + ", ".join(matches))


def github_base(repo):
    url = sh(["git", "-C", repo, "remote", "get-url", "origin"])
    # git@github.com:Owner/Name.git  ->  https://github.com/Owner/Name
    m = re.match(r"git@github\.com:(.+?)(?:\.git)?$", url)
    if m:
        return "https://github.com/" + m.group(1)
    return re.sub(r"\.git$", "", url)


def latest_hash(repo):
    subprocess.run(["git", "-C", repo, "fetch", "--quiet", "origin"],
                   capture_output=True, text=True)
    for ref in ("origin/main", "origin/master"):
        h = sh(["git", "-C", repo, "rev-parse", ref])
        if h:
            return h, ref
    return sh(["git", "-C", repo, "rev-parse", "HEAD"]), "HEAD"


def list_skills(repo):
    d = os.path.join(repo, "skills")
    if not os.path.isdir(d):
        sys.exit(f"ERROR: {d} does not exist.")
    return {n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("article")
    ap.add_argument("--repo")
    args = ap.parse_args()

    article = os.path.abspath(os.path.expanduser(args.article))
    with open(article, encoding="utf-8") as f:
        text = f.read()
    lines = text.splitlines()

    repo = resolve_repo(args.repo)
    base = github_base(repo)
    h, ref = latest_hash(repo)
    skills = list_skills(repo)

    def url(name):
        return f"{base}/blob/{h}/skills/{name}/"

    # Collect mentions with code-block awareness.
    in_code = False
    mentions = []  # (lineno, name, in_code)
    for i, line in enumerate(lines, 1):
        if FENCE.match(line):
            in_code = not in_code
            continue
        for m in SKILL_TOKEN.finditer(line):
            name = m.group(1)
            if name in skills:
                mentions.append((i, name, in_code))

    # A skill is "already linked" if its URL path appears anywhere in the file.
    def already_linked(name):
        return f"/skills/{name}/" in text

    print(f"repo:        {repo}")
    print(f"github base: {base}")
    print(f"latest hash: {h}  ({ref})")
    print(f"skills in repo: {len(skills)}")
    print(f"article: {article}")
    print()

    # First prose (non-code, not-already-linked) mention per skill.
    seen = set()
    to_link = []
    for lineno, name, code in mentions:
        if code or name in seen or already_linked(name):
            continue
        seen.add(name)
        to_link.append((lineno, name))

    if to_link:
        print("=== LINK THESE (first prose mention of each) ===")
        for lineno, name in to_link:
            print(f"  L{lineno}  /{name}")
            print(f"        markdown: [`/{name}`]({url(name)})")
            print(f"        context : {lines[lineno-1].strip()}")
    else:
        print("=== nothing to link (all mentions are in code blocks, "
              "already linked, or not real skills) ===")

    # Transparency: list everything skipped.
    skipped = [(l, n, c) for (l, n, c) in mentions
               if (c or already_linked(n) or n not in {x[1] for x in to_link})]
    if skipped:
        print()
        print("=== skipped mentions (for reference) ===")
        for lineno, name, code in mentions:
            if (lineno, name) in [(l, n) for l, n in to_link]:
                continue
            reason = ("code-block" if code
                      else "already-linked" if already_linked(name)
                      else "later-duplicate")
            print(f"  L{lineno}  /{name}  [{reason}]")


if __name__ == "__main__":
    main()
