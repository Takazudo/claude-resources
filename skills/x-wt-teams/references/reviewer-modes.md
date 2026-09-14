# Reviewer Modes

Which reviewer runs at each review point, and how the flags select it. The skill body links here from Step 1 (planning), Step 5 (child self-review), and Step 9 (final quality assurance).

## The two tiers

| Invocation | Reviewer | When |
| --- | --- | --- |
| no reviewer flag | `/code-review --fix` | **Default.** General review — the built-in reviewer, running in its own context window. |
| `-co` / `--codex` | `/deep-review` | Deep pass: `/code-review` **plus** `/codex-review` for cross-model coverage. |

`-nor` / `--no-review` skips the review point entirely.

**Effort is not settable here.** This skill has no effort option — invoke whichever reviewer runs bare, and it falls back to its own default (`/code-review` reuses the level the user last typed). Depth comes from `-co`, not from an effort dial: codex is the deep reviewer.

> **`ultra` is not a value any skill may pass.** It is a paid cloud review that only the user can start by typing `/code-review ultra`. If a change looks like it warrants one, recommend it in the final report.

## Where each review point lands

- **Step 1 (planning 2nd opinion)** — `/codex-2nd`, unchanged. This reviews the *plan*, not code, and is a separate concern from the tiers above. It falls back silently to an Opus subagent when codex is down.
- **Step 5 (child self-review)** — children review their own diff by hand, invoking no review skill. See "Child self-review" below; this is the one review point with a hard constraint on it.
- **Step 9 (quality assurance)** — the manager runs whichever tier the flags selected, on the `base/<project-name>` branch.

## Child self-review (Step 5) — foreground only

A child agent must never end its turn waiting on something it did not synchronously complete, because every completion notification in this harness routes to the **manager**, not to the child. A child that waits on one parks forever, with its work committed but never reported.

So at Step 5 **a child reviews its own diff by hand**: read `git diff <base>...HEAD`, apply the clearly-useful fixes, and commit. No skill invocation, no subagent — a nested `Agent` call returns an async handle even with `run_in_background: false`, and its notification routes to the manager.

**Why not `/code-review` here, when it is the default reviewer everywhere else.** Measured, not assumed (see `references/execution-modes.md` for the full result): invoked from a plain subagent, `/code-review` returns an **async handle**, not findings — it backgrounds even there. And `TaskOutput`, the tool that would drain such a handle, **is not in a subagent's toolset at all**, so the child has no way to pull the result. A child's diff is one topic's worth of changes; reading it directly costs little and cannot park.

Managers keep using `/code-review` — they are the context it was built for.

Children never run `/deep-review` or `/codex-review`, regardless of the manager's flags. A deep cross-model pass is a manager-level concern at Step 9; running it per-child would multiply codex load by the number of live children for no added coverage.

Canonical rule: `references/execution-modes.md` → "Invariant".

## Codex mode (`-co`) beyond review

`-co` also swings non-review work to codex, unchanged by this document's review changes:

| Default | With `-co` | Used for |
| --- | --- | --- |
| Agent tool (web search, research) | `/codex-research` | Research during planning or implementation |
| Agent tool (doc writing) | `/codex-writer` | READMEs, doc comments, prose |

Every codex-backed skill falls back silently to a Claude equivalent when codex is rate-limited or unavailable. Nothing at the dispatcher level needs to handle that — the fallback is invisible, and it never pauses the workflow or surfaces a quota error.

## There is no reviewer-model flag

**Claude Code ignores skill-level model overrides** — a skill that forks into a subagent resolves its model as `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation param → its own frontmatter → the main conversation's model. So `/code-review` runs on **the session model**. Change it with `/model` or `CLAUDE_CODE_SUBAGENT_MODEL`.

Effort is `/code-review`'s own dial, not this skill's — nothing on this invocation sets it. A child's model comes from its per-topic `/big-plan` annotation; see `arguments.md`.

`/big-plan` has no plan-reviewer model flag either: its Step 5 review is unconditional (`/codex-2nd`, falling back to Opus on its own) with `-nor` as the only opt-out.

## Review findings → fix issue

When Step 9 produces findings to hand to a fix agent, group them by which reviewer raised them:

```markdown
## Review Findings to Fix

### From /code-review
- ...

### From /codex-review
- ...
```

A finding **both** reviewers raised independently is the strongest signal available — rank those first. Where they disagree, prefer the one citing specific code over the one reasoning abstractly. Flattening the list into one homogenized set throws that signal away.
