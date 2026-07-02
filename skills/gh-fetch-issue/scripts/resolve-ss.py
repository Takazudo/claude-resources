#!/usr/bin/env python3
"""Resolve `/ss <filename>` screenshot placeholders in a GitHub issue.

A user drafting an issue writes a line like:

    /ss Screenshot 2026-07-02 at 4.15.54.png

as a placeholder for a screenshot that lives in their local Dropbox
screenshots dir. This script finds those lines, uploads the matching local
images to the repo's `_attachments` release (via the gh-issue-with-imgs
upload helper), and rewrites the issue body / comments so each placeholder
becomes a real embedded image: `![<filename>](<asset-url>)`.

Only placeholders whose file is found in the screenshots dir are resolved;
unresolved ones are left untouched and reported. Re-running is safe: once a
line is rewritten it no longer matches, so nothing is uploaded twice.

Usage:
    resolve-ss.py <issue-url-or-number> [--repo owner/repo]
                  [--screenshots-dir DIR] [--dry-run]
"""

import argparse
import json
import os
import re
import subprocess
import sys

SS_LINE = re.compile(r"^\s*/ss\s+(\S.*?)\s*$")
COMMENT_ID = re.compile(r"issuecomment-(\d+)")
UPLOAD_SCRIPT = os.path.join(
    os.environ["HOME"],
    ".claude/skills/gh-issue-with-imgs/scripts/upload-to-release.sh",
)


def die(msg):
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def gh_json(args):
    out = subprocess.run(
        ["gh", *args], capture_output=True, text=True
    )
    if out.returncode != 0:
        die(out.stderr.strip() or f"gh {' '.join(args)} failed")
    return json.loads(out.stdout)


def resolve_ref(issue_input, repo_override):
    m = re.match(r"^https://github\.com/([^/]+/[^/]+)/issues/(\d+)", issue_input)
    if m:
        return m.group(1), m.group(2)
    m = re.match(r"^#?(\d+)$", issue_input)
    if m:
        if repo_override:
            return repo_override, m.group(1)
        repo = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
            capture_output=True, text=True,
        ).stdout.strip()
        if not repo:
            die("could not detect repo; pass --repo owner/repo or a full URL")
        return repo, m.group(1)
    die(f"invalid issue reference: {issue_input}")


def find_placeholders(text):
    """Return list of (lineno, filename) for each /ss line in text."""
    hits = []
    for i, line in enumerate(text.split("\n")):
        m = SS_LINE.match(line)
        if m:
            hits.append((i, m.group(1)))
    return hits


def rewrite(text, resolved):
    """Replace /ss lines whose filename is in `resolved` (name -> url)."""
    changed = False
    lines = text.split("\n")
    for i, line in enumerate(lines):
        m = SS_LINE.match(line)
        if m and m.group(1) in resolved:
            lines[i] = f"![{m.group(1)}]({resolved[m.group(1)]})"
            changed = True
    return "\n".join(lines), changed


def upload(repo, paths):
    """Upload paths via the shared helper; return list of URLs in order."""
    out = subprocess.run(
        ["bash", UPLOAD_SCRIPT, repo, *paths], capture_output=True, text=True
    )
    if out.returncode != 0:
        die("upload failed:\n" + (out.stderr.strip() or out.stdout.strip()))
    urls = [u for u in out.stdout.splitlines() if u.strip()]
    if len(urls) != len(paths):
        die(f"expected {len(paths)} upload URLs, got {len(urls)}")
    return urls


def patch_body(repo, num, body, dry_run):
    if dry_run:
        return
    subprocess.run(
        ["gh", "api", f"repos/{repo}/issues/{num}", "-X", "PATCH", "--input", "-"],
        input=json.dumps({"body": body}), text=True, check=True,
        capture_output=True,
    )


def patch_comment(repo, cid, body, dry_run):
    if dry_run:
        return
    subprocess.run(
        ["gh", "api", f"repos/{repo}/issues/comments/{cid}", "-X", "PATCH", "--input", "-"],
        input=json.dumps({"body": body}), text=True, check=True,
        capture_output=True,
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("issue")
    p.add_argument("--repo", default="")
    p.add_argument("--screenshots-dir",
                   default=os.environ.get("DROPBOX_SCREENSHOTS_DIR", ""))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.screenshots_dir:
        die("screenshots dir unknown; set $DROPBOX_SCREENSHOTS_DIR or pass --screenshots-dir")
    if not os.path.isfile(UPLOAD_SCRIPT):
        die(f"upload helper not found: {UPLOAD_SCRIPT}")

    repo, num = resolve_ref(args.issue, args.repo)
    issue = gh_json(["issue", "view", num, "--repo", repo,
                     "--json", "body,comments"])
    body = issue.get("body") or ""
    comments = issue.get("comments") or []

    # Gather every distinct filename referenced by a /ss line, in first-seen order.
    referenced = []
    for _, fn in find_placeholders(body):
        if fn not in referenced:
            referenced.append(fn)
    for c in comments:
        for _, fn in find_placeholders(c.get("body") or ""):
            if fn not in referenced:
                referenced.append(fn)

    if not referenced:
        print("No /ss placeholders found — nothing to resolve.")
        return

    found, missing = [], []
    for fn in referenced:
        path = os.path.join(args.screenshots_dir, fn)
        (found if os.path.isfile(path) else missing).append(fn)

    for fn in missing:
        print(f"  skip (not in screenshots dir): {fn}", file=sys.stderr)

    if not found:
        die("no referenced screenshots were found in the screenshots dir")

    if args.dry_run:
        # Preview only: no upload, no patch. Use a placeholder URL so rewrite()
        # can report which locations would change.
        resolved = {fn: "(pending upload)" for fn in found}
    else:
        paths = [os.path.join(args.screenshots_dir, fn) for fn in found]
        urls = upload(repo, paths)
        resolved = dict(zip(found, urls))

    patched = []

    new_body, changed = rewrite(body, resolved)
    if changed:
        patch_body(repo, num, new_body, args.dry_run)
        patched.append("body")

    for c in comments:
        cbody = c.get("body") or ""
        new_c, changed = rewrite(cbody, resolved)
        if not changed:
            continue
        m = COMMENT_ID.search(c.get("url") or "")
        if not m:
            print(f"  warn: cannot find comment id for {c.get('url')}", file=sys.stderr)
            continue
        patch_comment(repo, m.group(1), new_c, args.dry_run)
        patched.append(f"comment {m.group(1)}")

    verb = "Would resolve" if args.dry_run else "Resolved"
    print(f"{verb} {len(found)} screenshot(s) in {repo}#{num}: {', '.join(found)}")
    if patched:
        print(f"  {'would patch' if args.dry_run else 'patched'}: {', '.join(patched)}")
    if missing:
        print(f"  left as-is (not found locally): {', '.join(missing)}")
    print(f"  https://github.com/{repo}/issues/{num}")


if __name__ == "__main__":
    main()
