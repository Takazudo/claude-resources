# Web mode contract (Claude Code on the web)

When `$CLAUDE_CODE_REMOTE=true`, skills run in the cloud container, which differs
from the macOS terminal in the ways below. Skills reference this file so the rules
live in one place — keep one copy of each skill and make only these touch points
environment-aware.

## 1. GitHub: MCP, not `gh`

`gh` is not installed and the GitHub API is reachable only through the GitHub
MCP (`mcp__github__*`). Translate every `gh` command to its MCP equivalent per
[`github-ops.md`](./github-ops.md). Two gotchas:

- **Push before creating a PR** — MCP only sees pushed branches.
- **Pre-create labels** (e.g. `epic`, `sub`, `agent-found`) — there is no
  create-label MCP tool.

## 2. Claude-only — no Codex

The Codex CLI (`-co` / `/codex-review`) is not available in the container. The
`codex-review` skill is disabled in `settings.web.json`.

- **Ignore the `-co` flag.**
- Any step whose default backend is Codex (e.g. `/light-review` and
  `/deep-review` default to `/codex-review`) **defaults to a Claude reviewer
  instead** (Sonnet, or the model set by a `-op`/`-so`/`-haiku` flag).

## 3. Subagents-only — no agent teams

The experimental agent-teams path (`TeamCreate` / `SendMessage` / named
teammates) is not used on web.

- Fan out **one-shot subagents** via the Agent/Task tool instead.
- Where a skill would route to the teams path or delegate fixes to
  `/x-wt-teams` team-fix mode, run the work as plain subagent fan-out (each child
  in its worktree, return on completion — no inter-agent messaging).

## 4. No Dropbox — persist to git or GitHub

Dropbox is not reachable (no MCP, network blocked). `$DROPBOX_CCLOGS_DIR` /
`$DROPBOX_SCREENSHOTS_DIR` are stubbed to `/tmp` — by the environment's
env-vars field under the pre-launch loader (`web/env-setup-script.sh`), or by
`setup-web.sh` via `$CLAUDE_ENV_FILE` when it runs as a SessionStart hook.
Either way `/tmp` is **ephemeral** — the container is reclaimed after the
session.

For anything that must survive the session:

- **Commit it to the repo** (git, or MCP `create_or_update_file` / `push_files`), or
- **Post it to the GitHub issue / PR** (`add_issue_comment`).

`/tmp` is fine only for within-session scratch.

## 5. The session branch IS the base — no `base/<topic>`, no second base level

Web starts each session on its own working branch — `git branch --show-current`
returns `claude/<adjective>-<name>-<hash>` — forked from the branch the user
started the session on (**today always the repo default**, e.g. `main`; a future
non-default start branch is allowed for in the wording below). Treat that session
branch as the **base branch** the skills would otherwise create. This is exactly
the `--stay` / adopt-current-branch case the skills already support, with the
parent fixed to the fork-from branch — **never** create a `base/<topic>` on top
of it, and **never** push an empty start commit.

### Canonical detection — run this, do not assume

Detection is a **branch-shape check**, not an env-var read with the answer
hard-coded. Compute these **once, at the start of the skill** (re-running
`git branch --show-current` after a later `git checkout` returns the wrong
branch — capture into a variable and reuse it):

```bash
# Only meaningful when $CLAUDE_CODE_REMOTE = true; on terminal these are unused.
WEB_DEFAULT=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
WEB_CUR=$(git branch --show-current)        # empty in detached HEAD → hard error, stop
if [ -z "$WEB_CUR" ]; then
  echo "ERROR: detached HEAD on web — cannot determine the session base branch."; exit 1
fi
if [ "$WEB_CUR" = "$WEB_DEFAULT" ]; then
  # Non-adopted / lazy session: the session branch was not (yet) created.
  # Cut ONE claude/<slug> base, check it out (so push==current holds), then push.
  WEB_BASE="claude/<slug>"
  git checkout -b "$WEB_BASE"
else
  WEB_BASE="$WEB_CUR"                        # the adopted claude/* session branch
fi
WEB_PARENT="$WEB_DEFAULT"                    # parent = the branch the session was forked from
```

- **`$WEB_BASE` is the one canonical name.** Each skill already captures the
  current branch into its own variable (`$PARENT_BRANCH` in `/big-plan`,
  `$INVOCATION_BRANCH` in `/x-wt-teams` and `/x-as-pr`). **On web that existing
  variable IS `$WEB_BASE` — do NOT introduce a second live variable.** Where a
  skill's prose says "parent branch" on web, it means `$WEB_PARENT`; where it
  says "base branch", it means `$WEB_BASE`.
- **Parent / root-PR target = `$WEB_PARENT`** — the branch the session was forked
  from (today: the repo default). This **inverts** the terminal rule "root PR
  base = the invocation branch": on web the invocation branch is `$WEB_BASE`, and
  its PR targets `$WEB_PARENT`. **Do NOT run the terminal `--stay`
  `gh pr view <branch> --json baseRefName` preference step** — on web the parent
  is `$WEB_PARENT` unconditionally, even when the session branch already has a PR
  (the "Create PR" button or a prior `claude/*` PR can make that lookup return a
  non-default base, which is wrong here).

### One push/branch rule

- **Push only the branch you are currently checked out on**, and only
  `claude/`-prefixed branches are pushable. **Any branch you create on web MUST
  be `claude/`-prefixed AND pushed only while it is the current branch.** Never
  push a branch you are not on — the web GitHub proxy rejects it. Topic / fix
  branches are merged into `$WEB_BASE` **locally** and are not pushed.
- **Defer the root PR until the first real commit exists.** With no empty start
  commit, `$WEB_BASE` and `$WEB_PARENT` are identical at session start, so
  `create_pull_request(head=$WEB_BASE, base=$WEB_PARENT)` fails with "No commits
  between …". Create the root/draft PR via MCP only **after** the first real
  commit lands on `$WEB_BASE` (or adopt the PR the UI "Create PR" button made,
  via `list_pull_requests` head=`$WEB_BASE`). Push `$WEB_BASE` before the MCP PR
  call.

### Per-skill shape

- **`/x-wt-teams`** — topic worktrees fork from `$WEB_BASE`
  (`git worktree add worktrees/<t> -b <t> "$WEB_BASE"`) and merge back into it
  locally; the root PR is `$WEB_BASE` → `$WEB_PARENT`. No `base/<topic>` layer,
  no per-topic push loop, no per-topic documentation PRs. After the `-m` merge,
  `git checkout "$WEB_BASE"` (it survives — see below) so the manager stays on a
  pushable branch; do NOT stay on `$WEB_PARENT` (it is not pushable).
- **`/x-as-pr`** — commit directly on `$WEB_BASE` (do not branch `topic/<slug>`);
  the PR is `$WEB_BASE` → `$WEB_PARENT`.
- **`/big-plan`** — planning only, and the issues it creates **outlive the
  session**: they are usually implemented by a fresh session (terminal or web)
  for which this session's `claude/*` name is a stale, meaningless ref. So issue
  bodies get the **same portable spec as a terminal plan**: base =
  `base/{slug}`, parent = the resolved `$WEB_PARENT` literal (e.g. `main`) —
  never the session-branch name. (On web the skill's `$PARENT_BRANCH` variable
  holds the session branch, so substitute `$WEB_PARENT` wherever issue text
  would embed `$PARENT_BRANCH`.) A web implementation session substitutes its
  own session branch as the base at runtime (this section); a terminal session
  creates `base/{slug}` as written. Exception — resource handoff:
  `_temp-resource/...` is committed directly onto `$WEB_BASE` and pushed with
  its base PR, so that branch is real and durable; the epic's "Use this PR as
  base" note names it literally.
- **`-m` / merge** — merge `$WEB_BASE` → `$WEB_PARENT` via MCP
  `merge_pull_request`, **without a branch-delete flag**. **Do NOT delete the
  `claude/*` session branch — the web platform owns it.** There is no
  `base/<topic>` to clean up. After merge the work is on `$WEB_PARENT`; the UI's
  "Create PR" button still shows the session branch — tell the user to ignore it.
- **Fix branches** (`-fix` / CI-fix) — name them `claude/agent-fix-<slug>`
  (`claude/`-prefixed so they are pushable), fork from `$WEB_PARENT`, push each
  while it is the current branch, then return to `$WEB_BASE`. These are normal
  `claude/` branches and **may** be merged-and-deleted; only `$WEB_BASE` is
  protected.

### Cleanup protects the session branch by name

When handing a manifest to `/cleanup-resources`, pass the session branch as
`role: session-web` with `protected-session-branch: <its literal name>`. The
audit must **never** delete or check-out-off that exact branch, even when its PR
is merged. Protect it by **name**, not by the `claude/*` prefix — dead
`claude/agent-fix-*` branches still need deleting.

### Not supported on web

- **Super-epic / multi-base stacking is unsupported on web.** It requires real
  `base/<super>` and `base/<super>-<epic>` branches that are neither
  `claude/`-prefixed (unpushable) nor the session branch. A skill that detects
  both `$CLAUDE_CODE_REMOTE=true` and super-epic markers must refuse early and
  tell the user to run super-epics from the terminal. The single-base model does
  **not** collapse the two-base super-epic topology — do not pretend it converges.

The terminal's `--stay`, the "Use this PR as base" resource-handoff reuse, and a
single-base epic all **converge** to this model on web. The two-base super-epic
does not — it is out of scope on web.

### Commit identity & the "Unverified-commit" hook

Web commits are authored as `Claude <noreply@anthropic.com>` (our `setup-web.sh`
pins this `--global`) and are **unsigned** — the container has no GPG/SSH signing
key — so GitHub shows them **Unverified**. This is a **platform limitation, not a
bug in our setup**, and it is unavoidable for any commit created with local `git`
on web.

The web container ships its own commit-verification hook at
`~/.claude/stop-hook-git-check.sh` (**platform-injected — not in `claude-settings`,
so we cannot edit or remove it from this repo**). After a commit it may warn that
the branch will show as Unverified and suggest
`git config … && git commit --amend --no-edit --reset-author`.

**Do not follow that suggestion on web:**

- The committer email is **already** `noreply@anthropic.com`, so the email half of
  the check already passes — `git config` would be a no-op (and our web profile now
  permits `git config user.email`/`user.name` precisely so this is never a hard
  block, but it changes nothing).
- `--amend --reset-author` **cannot add a signature** — the missing signature is
  the only thing left making the commit Unverified, and there is no key to sign
  with. Amending just rewrites the tip for no gain.

So the warning is **expected platform noise** for our workflow — acknowledge it and
move on; it does not indicate anything is wrong with the commit's identity.

**If a genuinely Verified commit is ever required**, do not chase a signing key —
create the commit through the **GitHub MCP** (`create_or_update_file` /
`push_files`, see §4). Commits made via GitHub's API are web-flow-signed by GitHub
and show as **Verified**; locally-`git`-made commits pushed through the proxy are
not.

## 6. Subagent fan-out — the local 6-concurrent cap does not apply

`/x-wt-teams` (and the `/big-plan` chain that drives it) throttles child-agent
fan-out to **6 concurrent** on the terminal. That cap exists for one reason — to
stop a parallel run from freezing the user's **interactive Mac** (CPU thrash,
many heavy processes). The cloud container is not that machine, so on web the cap
is **lifted: spawn all topics in one parallel batch** (one Agent call per topic
in a single message) instead of queueing in groups of 6.

Two limits remain, because their reason is NOT "don't freeze the Mac":

- The container still has finite RAM/CPU, so this is "no fixed small cap," not
  "literally unbounded." For a pathologically large single wave, let the harness
  queue / use judgment. In practice `/x-wt-teams` topic counts are small (a
  handful), so fanning them all out at once is fine.
- The **browser-verification "one alive at a time, sequential" rule and the port
  `flock` rule** (`x-wt-teams/references/resource-coordination.md`) STILL apply.
  Their reasons — context-window token balloon (large DOM/accessibility
  snapshots) and port collisions on the shared container filesystem — are
  environment-independent. "No child-count cap" does NOT license many concurrent
  browser subagents.

## 7. Browser verification on web

The container blocks Playwright's browser-download CDN, so the auto-download
path fails. A pre-installed Chromium lives under `/opt/pw-browsers/` and must
be located at runtime:

```bash
CHROME_BIN=$(ls -d /opt/pw-browsers/*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1)
```

Do **not** hardcode the version directory (`<ver>`); glob and pick the newest
so the contract survives container image bumps. Guard against a missing binary:

```bash
if [ -z "$CHROME_BIN" ]; then
  echo "ERROR: pre-installed Chromium not found under /opt/pw-browsers/"; exit 1
fi
```

Do **not** fall back to the CDN download — it is blocked.

Pass the located path and the required sandbox flags when launching:

```js
const chromeBin = execSync(
  'ls -d /opt/pw-browsers/*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1'
).toString().trim();
const browser = await chromium.launch({
  executablePath: chromeBin,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
```

Also bind the dev server to `127.0.0.1`. Subdomain hostnames like
`foo.localhost` are **not** resolved in the container, so any URL that relies
on them will time out; use `http://127.0.0.1:<port>` directly.

- These rules apply only when `$CLAUDE_CODE_REMOTE=true`.
- `/verify-ui` and `/headless-browser` (the "seeing-eye" fallback) are **not**
  auto-installed on web — `scripts/setup-web-wisdom.sh` only bakes one
  doc-lookup skill per wisdom repo (`test-wisdom` for `zudo-test-wisdom`); the
  browser-helper skills stay uninstalled under
  `$HOME/.claude-wisdom/zudo-test-wisdom/.claude/skills/`.
- The working path on web is this section's own inline Playwright recipe
  above — locate the pre-installed Chromium and launch it directly, no extra
  skill install needed. A session that wants the `/verify-ui` /
  `/headless-browser` slash commands themselves can symlink them manually from
  the `zudo-test-wisdom` clone into `~/.claude/skills/`.

## 8. The `-m` merge runs in-turn on web — never punt CI to the background

On the terminal, `/pr-complete -c -w` watches CI by launching a `gh` poll loop as
a **background** `Bash` task; when that task exits, the harness re-invokes the
agent with a `<task-notification>`, so "CI green → merge" fires autonomously
without the agent having to stay in the turn. **On web that wakeup does not
exist:** `gh` is unavailable (no background poll script to run), and a
self-scheduled "I'll check back in N minutes" frequently never fires. The result
is the failure this contract exists to kill — the PR is created and marked ready,
CI is "watching in the background," the turn ends, and **the merge never
happens**, so a `/x -m -a` that promised hands-off end-to-end instead looks like
the agent is waiting for permission to merge.

So on web, treat **"watch CI then merge" as one blocking, in-turn step**:

1. **Poll in-turn, do not yield the turn.** Loop on the PR's checks via the
   GitHub MCP (`pull_request_read` with `get_check_runs`) — wait ~30–60 s between
   polls (a short foreground `Bash` sleep, or the `Monitor` tool) — until **every
   required check is terminal**. Stay in the same turn; do **not** end your
   message with "CI is running, I'll check back."
2. **Merge immediately when green.** The moment all checks are green, merge in the
   same run via `merge_pull_request` (no branch-delete for the `claude/*` session
   head — §5), then continue straight into the post-merge steps (close issue,
   `-w` target-branch CI, cleanup audit). Do **not** hand the merge decision back
   to the user — under `-m` they already authorized it.
3. **On CI failure**, run the skill's normal bounded fix cycles (investigate → fix
   on the session branch or a `claude/agent-fix-*` branch as the skill directs →
   re-poll). Only stop after the skill's cycle cap, and then say exactly what
   failed.
4. **Bounded, with a self-continue fallback — never a user handoff.** Poll
   in-turn for up to ~30 min. If CI is genuinely still pending past that, do
   **not** stop and wait for the user — self-schedule a continuation via the
   Claude Code Remote `send_later` MCP tool (verified in this container as
   `mcp__Claude_Code_Remote__send_later`; the `mcp__` prefix may vary by
   surface), a few minutes out, whose prompt is "re-poll PR #N and merge when
   green, per `-m`," so the chain resumes itself. The only legitimate hard
   stops are CI **failure** (after the fix cap) and a real blocker (expired MCP
   token, branch-protection refusal) — and a blocker stop must name the exact
   action you need from the user.

This applies wherever a web skill would "watch CI in the background and merge when
green": `/pr-complete -c -w`, `/watch-ci`, and the Merge Mode of `/x-as-pr` and
`/x-wt-teams`. The post-merge `-w` watch is the same in-turn poll (report when
green; if the target-branch CI goes red, fix via a `claude/agent-fix-*` PR per
§5). The terminal background-poll model (`/watch-ci` via `Bash
run_in_background`) is **terminal-only** — its "do NOT block the conversation
with polling" instruction does **not** apply on web, where blocking in-turn is
exactly what makes the merge complete.

## 9. Skip worktree cleanup — the container is ephemeral

On the terminal, skills that fan out into `worktrees/<topic>/` remove those
worktrees when the work is done (`git worktree remove`) to free disk and close
tmux panes. On web neither payoff exists: the container is reclaimed after the
session (§4), and the teams/tmux path is never taken (§3). So **skip the
worktree-removal step entirely** — including any follow-up
`pnpm install --ignore-scripts` that exists only to repair the symlinks that
removal would have broken. Topic branches already merged into `$WEB_BASE`
survive on their own; the worktree checkouts are dead weight that vanishes with
the container. Leaving them does not affect the push (only `$WEB_BASE`'s commits
are pushed, never untracked worktree directories), so go straight from the merge
step to the next real step.
