#!/usr/bin/env python3
"""Fetch a single Figma node from a share URL via the Figma REST API.

Reads FIGMA_API_TOKEN (env, or recovered from the user's zsh config) and, given a
Figma design URL, renders the node to PNG and dumps its full node JSON. This is the
no-Dev-Mode substitute for the Dev Mode MCP: the REST API only checks file access,
not seat type, so a free Figma account can read any file it can open.

Usage:
    fig-fetch.py <figma-url> [--scale N] [--out-dir DIR] [--format png|svg]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

API = "https://api.figma.com/v1"


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def _token_from_files():
    """Grep shell configs for a literal FIGMA_API_TOKEN assignment.

    The token lives in ~/.zshrc, which only *interactive* shells source — the
    non-interactive shell running this script won't have it in env. Reading the
    file avoids both zsh-startup stdout pollution and the `[[ -o interactive ]]
    || return` guard that many .zshrc files open with.
    """
    home = os.path.expanduser("~")
    pat = re.compile(r"^\s*(?:export\s+)?FIGMA_API_TOKEN=(.+?)\s*$")
    for fn in (".zshenv", ".zshrc", ".zshrc.local", ".zprofile", ".profile",
               ".bashrc"):
        p = os.path.join(home, fn)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = pat.match(line)
                    if not m:
                        continue
                    val = m.group(1)
                    if val[:1] in ("'", '"'):  # quoted literal
                        q = val[0]
                        end = val.find(q, 1)
                        if end != -1:
                            return val[1:end]
                    else:  # bare value; skip dynamic (command sub / var ref)
                        val = val.split(" #")[0].strip()
                        if val and "$" not in val and "`" not in val:
                            return val
        except Exception:
            continue
    return ""


def _token_from_shell():
    """Last resort: interactive zsh, taking the last non-empty stdout line so any
    prompt/instant-prompt noise printed before the value is discarded."""
    try:
        out = subprocess.run(
            ["zsh", "-ic", "print -r -- ${FIGMA_API_TOKEN:-}"],
            capture_output=True, text=True, timeout=15,
        )
        lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
        return lines[-1] if lines else ""
    except Exception:
        return ""


def get_token():
    tok = (os.environ.get("FIGMA_API_TOKEN", "").strip()
           or _token_from_files()
           or _token_from_shell())
    if not tok:
        die("FIGMA_API_TOKEN not found. Add `export FIGMA_API_TOKEN=figd_...` to "
            "~/.zshrc (generate at Figma > Settings > Security > Personal access "
            "tokens, scope: File content read-only), then retry.")
    return tok


def parse_url(url):
    """Extract (file_key, node_id) from a Figma design/file URL.

    In share URLs the node id encodes ':' as '-' (e.g. node-id=12671-1784 means
    node 12671:1784; instance ids like I2-3;4-5 mean I2:3;4:5). Convert every '-'.
    """
    m = re.search(r"/(?:design|file)/([A-Za-z0-9]+)", url)
    if not m:
        die(f"Could not find a Figma file key in URL: {url}")
    file_key = m.group(1)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    raw = (q.get("node-id") or q.get("node_id") or [""])[0]
    if not raw:
        die("URL has no node-id. Select the component/frame in Figma and copy its "
            "link (right-click > Copy link to selection) so it includes node-id.")
    node_id = raw.replace("-", ":")
    return file_key, node_id


def api_get(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        if e.code in (401, 403):
            die(f"Figma API {e.code} (auth/permission). Token may be invalid, "
                f"expired, or lack access to this file. {body}")
        if e.code == 404:
            die(f"Figma API 404 — file/node not found or no access. {body}")
        die(f"Figma API {e.code}: {body}")
    except Exception as e:
        die(f"Request failed: {e}")


def summarize(doc):
    bb = doc.get("absoluteBoundingBox") or {}
    size = f"{round(bb.get('width', 0))}x{round(bb.get('height', 0))}" if bb else "?"
    lines = [
        f"name: {doc.get('name')}",
        f"type: {doc.get('type')}",
        f"size: {size}",
    ]
    # child layer names give a quick sense of structure without reading the JSON
    kids = [c.get("name") for c in (doc.get("children") or [])][:12]
    if kids:
        lines.append("children: " + ", ".join(str(k) for k in kids))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--format", default="png", choices=["png", "svg"])
    ap.add_argument("--out-dir", default=os.path.join(
        os.environ.get("TMPDIR", "/tmp").rstrip("/"), "fig-url-refer"))
    args = ap.parse_args()

    token = get_token()
    file_key, node_id = parse_url(args.url)
    os.makedirs(args.out_dir, exist_ok=True)
    slug = f"{file_key[:8]}-{node_id.replace(':', '-').replace(';', '_')}"

    # 1) node JSON (styles, text, layout, effects)
    nodes = api_get(f"/files/{file_key}/nodes?ids={urllib.parse.quote(node_id)}",
                    token)
    node = (nodes.get("nodes") or {}).get(node_id)
    if not node:
        die(f"Node {node_id} not present in response (wrong node-id or no access).")
    doc = node.get("document", {})
    json_path = os.path.join(args.out_dir, f"{slug}.json")
    with open(json_path, "w") as f:
        json.dump(node, f, ensure_ascii=False, indent=2)

    # 2) rendered image
    img = api_get(
        f"/images/{file_key}?ids={urllib.parse.quote(node_id)}"
        f"&format={args.format}&scale={args.scale}", token)
    if img.get("err"):
        die(f"Image render error: {img['err']}")
    url = (img.get("images") or {}).get(node_id)
    if not url:
        die("Figma returned no image URL for this node.")
    ext = args.format
    img_path = os.path.join(args.out_dir, f"{slug}.{ext}")
    urllib.request.urlretrieve(url, img_path)

    print(f"IMG:  {img_path}")
    print(f"JSON: {json_path}")
    print(summarize(doc))


if __name__ == "__main__":
    main()
