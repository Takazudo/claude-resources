#!/usr/bin/env python3
"""Archive GitHub notification emails for Takazudo's personal orgs out of the Gmail inbox."""
import argparse, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

ACCOUNT = "takazudo@gmail.com"
ORGS = ["Takazudo", "zudolab"]
# GitHub sets List-ID to "<repo>.<owner>.github.com"; Gmail's list: operator matches that suffix.
QUERY = "in:inbox from:notifications@github.com (" + " OR ".join(f"list:{o}.github.com" for o in ORGS) + ")"
API = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
HOME = os.environ["HOME"]


def access_token():
    cred = json.load(open(f"{HOME}/.google_workspace_mcp/credentials/{ACCOUNT}.json"))
    env = json.load(open(f"{HOME}/.claude.json"))["mcpServers"]["gmail-ws"]["env"]
    if "https://www.googleapis.com/auth/gmail.modify" not in cred.get("scopes", []):
        sys.exit("ERROR: saved credential lacks gmail.modify — re-auth via the gmail-ws start_google_auth tool")
    body = urllib.parse.urlencode({
        "client_id": env["GOOGLE_OAUTH_CLIENT_ID"],
        "client_secret": env["GOOGLE_OAUTH_CLIENT_SECRET"],
        "refresh_token": cred["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", body))["access_token"]


def call(token, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(8):
        req = urllib.request.Request(url, data=data, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            raw = urllib.request.urlopen(req).read()
            return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            # 403 here is almost always the per-minute "Total Query Cost" quota
            if e.code in (403, 429, 500, 503) and attempt < 7:
                time.sleep(20)
                continue
            sys.exit(f"ERROR {e.code}: {e.read()[:300]!r}")


def list_ids(token):
    ids, page = [], None
    while True:
        params = {"q": QUERY, "maxResults": 500, **({"pageToken": page} if page else {})}
        r = call(token, f"{API}?{urllib.parse.urlencode(params)}")
        ids += [m["id"] for m in r.get("messages", [])]
        page = r.get("nextPageToken")
        if not page:
            return ids


def repo_breakdown(token, ids):
    counts = Counter()
    for i in ids:
        m = call(token, f"{API}/{i}?format=metadata&metadataHeaders=List-ID")
        lid = next((h["value"] for h in m["payload"]["headers"] if h["name"].lower() == "list-id"), "")
        hit = re.search(r"<([^<>]+)\.([^.<>]+)\.github\.com>", lid)
        counts[f"{hit.group(2)}/{hit.group(1)}" if hit else "(unknown)"] += 1
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="count only, archive nothing")
    ap.add_argument("--by-repo", action="store_true", help="also print per-repo counts (5 quota units per message)")
    args = ap.parse_args()

    token = access_token()
    ids = list_ids(token)
    print(f"query: {QUERY}")
    print(f"matched: {len(ids)}")
    if args.by_repo and ids:
        for repo, n in repo_breakdown(token, ids).most_common():
            print(f"  {n:5d} {repo}")
    if args.dry_run or not ids:
        return
    archived = 0
    for start in range(0, len(ids), 1000):
        chunk = ids[start:start + 1000]
        call(token, f"{API}/batchModify", {"ids": chunk, "removeLabelIds": ["INBOX"]})
        archived += len(chunk)
    remaining = len(list_ids(token))
    print(f"archived: {archived}")
    print(f"remaining in inbox: {remaining}")


if __name__ == "__main__":
    main()
