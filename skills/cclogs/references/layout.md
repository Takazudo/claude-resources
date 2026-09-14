# What lives in a cclogs dir

Reference for interpreting an unfamiliar entry: which skill produced it, what the naming means, and what it is safe to skip.

## Contents

- [Naming conventions](#naming-conventions)
- [Producers](#producers)
- [Directory shapes](#directory-shapes)
- [Safe to ignore](#safe-to-ignore)
- [Path mechanics](#path-mechanics)

## Naming conventions

Most files come from `save-file.js`, which expands placeholders in the path:

| Placeholder | Expands to | Example |
| --- | --- | --- |
| `{logdir}` | the repo-scoped cclogs dir | `…/cclogs/zudo-composer` |
| `{timestamp}` | `MMDD_HHMM` | `0908_1206` |
| `{datetime}` | `YYYYMMDDHHMMSS` | `20260908120612` |
| `{date}` | `YYYYMMDD` | `20260908` |
| `{time}` | `HHMM` | `1206` |

So `20260908_115941-big-plan-sweep-260908.md` is a `/big-plan` log from that timestamp. Both `MMDD_HHMM` and full-`datetime` prefixes appear — the convention changed over time, and older files keep their original form.

A repeated name gets `-2`, `-3` appended before the extension rather than overwriting, so `foo-3.md` is the third save of the same name, not a third topic.

## Producers

| Entry | Written by | What it holds |
| --- | --- | --- |
| `*-big-plan-*.md` | `/big-plan` | The plan log: breakdown, review notes, verification report. A planning-session artifact — the implementer works from the GitHub issues, not from this |
| `*-codex-2nd.md`, `*-codex-review.md` | `/codex-2nd`, `/codex-review` | Cross-model feedback. The paired `*-stderr.log` is CLI noise |
| `*-reviewer-*.md`, `*-manager-*.md` | review and manager agents | Findings and gate decisions |
| `*-wt-child-*.md`, `*-x-wt-teams-*.md` | `/x-wt-teams` | Per-child implementation reports and the session report |
| `*-x-as-pr-*.md` | `/x-as-pr` | Session report for a single-topic run |
| `*-cleanup-resources-*.md` | `/cleanup-resources` | What was closed, kept, deleted |
| `local-workflow/` | `-lo` / `--local` runs | The plan and progress ledger that would otherwise be GitHub issues |
| `<descriptive-name>/` | `/prototype-first-wisdom` | A standalone prototype |
| `*-screenshots/`, `verify-ui-*/` | `/verify-ui`, `/headless-browser` | Visual evidence, usually paired with a report |

## Directory shapes

**Prototype** — `index.html` plus CSS/JS, or a `package.json` for a Vite/React one. Often a gallery of numbered variants (`pattern-01/`, `pattern-02/`) rather than a single design; check before assuming there is only one. Throwaway by intent: the value is the learning, and nothing here was ever meant to be committed as-is.

**Workflow coordination** (`local-workflow/<timestamp>-<slug>/`) — the local-mode substitute for GitHub issues:

| File | Role |
| --- | --- |
| `plan.md` | The epic / tracking issue body: summary, topics, base branch, wave plan |
| `sub-NN-<slug>.md` | One sub-issue body each, with a marker block giving Wave, Execution mode, Model, and Depends on |
| `progress.md` | The durable TODO checklist and progress log |
| `session-report.md` | End-of-workflow report |

Read `plan.md` first — it frames every sibling. The marker block in a sub spec drives scheduling, so treat its values as spec rather than prose.

**Image dirs** — screenshots from visual verification. The report interpreting them usually sits beside the directory as a `.md` file with a nearby timestamp.

## Safe to ignore

- `*-stderr.log` beside a `*.md` from the same run — CLI diagnostics, empty or noise unless that run failed.
- Repeated `*-check-2.log`, `*-check-3.log` — successive attempts. The highest number is the outcome; the earlier ones matter only when tracing what changed between them.
- Anything months old when the user is asking about recent work. Age is in the survey output for exactly this reason.

## Path mechanics

`get-logdir.js` resolves the base in order: `$DROPBOX_CCLOGS_DIR` → platform default (macOS `$HOME/Library/CloudStorage/Dropbox/cclogs`, WSL `/mnt/c/Users/takaz/Dropbox/cclogs`) → `$HOME/cclogs`. The env var is absent in hooks, cron, and other non-login shells, which is why the platform fallback exists.

The repo slug is the git toplevel basename, with two foldings: a worktree traces back to its main repo via `--git-common-dir`, and a trailing number is stripped (`zzmod2` → `zzmod`), so sibling clones of one project share a directory. Outside a git repo the slug is `_misc`.

Both foldings mean a hand-built path is often subtly wrong — resolve it with the script.
