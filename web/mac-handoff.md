# Mac-handoff contract (limited verification environments)

Applies to **Claude Code on the web only** (`$CLAUDE_CODE_REMOTE=true`) — the ephemeral cloud
container that can run the dev workflow, including a basic Playwright/DOM check via the
pre-installed Chromium ([`web-mode.md`](./web-mode.md) §7), but **cannot perform the final,
rich-environment verification** the `/big-plan` → `/x-as-pr` / `/x-wt-teams` workflows assume:
macOS-native UI rendering, Dropbox-dependent flows, real-device/display rendering, the user's
own visual judgment, and any Mac-only CI/build. (The `/verify-ui` / `/headless-browser` *skills*
are not auto-installed on web — `scripts/setup-web-wisdom.sh` only bakes `test-wisdom` — but the
underlying capability they wrap is available via web-mode.md §7's inline recipe.) Without that
step a run can finish — or auto-merge with `-m` — with the **final result never actually
confirmed**.

> **WSL is NOT a limited env here.** WSL is a persistent local machine that runs Playwright
> like Mac (once Chromium + `--no-sandbox` / `install-deps` are set up — see the
> `zudo-test-wisdom` browser skills), so it self-verifies and is treated as a capable "rich"
> env. Only the ephemeral web container triggers this handoff.

This file is the single source of truth for the fallback: keep working, but leave a durable
**`mac`** signal so a human re-verifies on a Mac. Skills reference it from a one-line banner,
the same way they reference [`web-mode.md`](./web-mode.md). It lives in `web/` (mirrored into
the web container by `scripts/setup-web.sh`, and present natively on Mac/WSL) so
`../../web/mac-handoff.md` resolves in every environment.

> This is orthogonal to `web-mode.md`. `web-mode.md` is the **GitHub-ops + branch** axis
> (web → MCP, no Dropbox, session branch). This is the **verification** axis (**web only**).
> On web the two compose: do every GitHub action below through the MCP per `github-ops.md`.

## 1. Detect the environment — compute once, reuse

```bash
# A "limited verification environment": cannot do the final visual / Mac-only check.
# Web container ONLY — WSL and native Linux are capable local machines (they run Playwright
# like Mac once Chromium + --no-sandbox are set up), so they are never flagged.
LIMITED_ENV=false
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  LIMITED_ENV=true
fi
```

Off web — macOS, **WSL**, native Linux — the signal is false → `LIMITED_ENV=false`, so those are
always the "rich" env and are never flagged. Only the ephemeral web container triggers this
handoff (and on web every GitHub action goes through the MCP per `github-ops.md`).

## 2. Trigger — when the handoff fires

Fire only when verification was actually expected and could not run:

```bash
# $BASE_REF = the branch this work targets (each skill plugs in its own base var:
#   /x-as-pr & /x-wt-teams root-PR base, e.g. $INVOCATION_BRANCH / $WEB_PARENT).
# $VERIFY_UI = true when -v / --verify-ui was passed.
UI_CHANGED=false
if git diff --name-only "$(git merge-base "$BASE_REF" HEAD)" HEAD 2>/dev/null \
     | grep -qiE '\.(css|scss|sass|less|styl|html?|vue|svelte|astro|tsx|jsx)$'; then
  UI_CHANGED=true
fi

DEFER_MAC=false
if [ "$LIMITED_ENV" = true ] && { [ "$VERIFY_UI" = true ] || [ "$UI_CHANGED" = true ]; }; then
  DEFER_MAC=true
fi
```

When `DEFER_MAC=true`, the `/verify-ui` / `/headless-browser` *skills* are not available by
name (not auto-installed on web — see above): don't reach for them as slash commands. A raw
Playwright check via `web-mode.md` §7's inline recipe can still confirm DOM/rendering basics,
but it cannot cover macOS-native UI, Dropbox-dependent flows, real-device rendering, or the
user's own visual judgment — apply §5/§6 below for those. When `DEFER_MAC=false`, behave exactly
as on a rich env (this is the off-web path — Mac / WSL / local — and the web path for pure
non-UI work).

The UI glob set above is the canonical list — all three skills share it; do not redefine it
per-skill.

## 3. The `mac` label (canonical definition)

All skills create it idempotently with this **exact** spec so a repo never ends up with two
variants:

- **name:** `mac`
- **color:** `5319E7`
- **description:** `Implemented in a limited env (web); final result unverified — check on Mac.` (keep ≤100 chars — GitHub's `gh label create` rejects longer descriptions with HTTP 422)

Created via `gh` on a terminal (Mac / WSL — where `/big-plan` seeds it; the web handoff only
*applies* the label, it cannot create one):

```bash
gh label create mac \
  --description "Implemented in a limited env (web); final result unverified — check on Mac." \
  --color 5319E7 2>/dev/null || true
```

**Web:** there is **no create-label MCP tool** (`web-mode.md` §1). You cannot create `mac` on
web — you can only apply it if it already exists. `/big-plan` seeds it during its label
bootstrap, so an epic-driven web run usually has it; an ad-hoc web run may not, which is
exactly why §4 degrades.

## 4. Applying the signal — label → title → comment (degradation chain)

GitHub access in these envs is partial, not absent: web can comment/edit via MCP but can't
create labels; a future env might allow even less. Apply the strongest signal that works,
then always explain in a comment. For each **target** (an issue or a PR):

1. **Label.** Ensure `mac` exists (§3), then apply it (`gh issue edit <n> --add-label mac` /
   `gh pr edit <n> --add-label mac`; web → MCP per `github-ops.md`). If it applied, done with
   the signal.
2. **Title prefix** (only if the label could not be applied). If the target's title does not
   already start with `[Mac] `, prefix it: `[Mac] <existing title>` (`gh issue edit <n>
   --title …` / `gh pr edit <n> --title …`; web → MCP). Idempotent — never double-prefix.
3. **Comment** (always — see §5). It is the universal floor: if neither the label nor the
   title could be set, the comment is the only signal, so it must explicitly **ask the human
   to create and apply a `mac` label** for this issue/PR.

## 5. The explanatory comment (always posted)

Independent of which signal step in §4 succeeded, post one comment on each target so the
reason is human-readable. Template:

```
🖥️ **Mac verification needed.** This was implemented on Claude Code web, where the final
rich-environment check (macOS-native rendering, Dropbox-dependent flows, real-device rendering,
your own visual judgment) and any Mac-only CI/build could not run, so the **final result has not
been confirmed**.

Please verify on a Mac (rich env):
- run the app / `/verify-ui` on the changed UI
- confirm any Mac-only CI / build
<if the `mac` label could not be applied:> _(Also: please add a `mac` label to this so it's
trackable — it couldn't be set automatically here.)_
```

## 6. The two behaviors

Pick by whether `-m` / `--merge` was passed. Both run only when `DEFER_MAC=true`.

### A. `-m` / `--merge` passed — merge anyway, then flag a new issue

1. **Skip the rich-environment verify step** (don't block on the parts §1's paragraph scopes
   out — macOS-native rendering, Dropbox-dependent flows, real-device rendering, the user's own
   visual judgment; the `/verify-ui` / `/headless-browser` skills aren't installed by name
   either, though a raw `web-mode.md` §7 Playwright check is available if useful). **Keep CI
   gating:** the merge still goes through the skill's normal `/pr-complete -c` path, which
   waits for GitHub CI to be green. Never force-merge red CI. ("Merge without final
   confirmation" = skip the *rich-environment/Mac* check, not skip CI.)
2. **After the merge succeeds**, create a NEW tracking issue:
   - **title:** `[Mac] Verify merged work — <topic> (#<orig-issue-if-any>)`  ← the `[Mac]`
     prefix means the signal survives even on web where the label can't be created.
   - **label:** `mac` (best-effort, §4 step 1).
   - **body:** state which limited env, that the merge happened **without** final
     verification, link the merged PR and the original issue, and include the §5 "check on a
     Mac" checklist.
   - This new issue is a **target** for §4/§5 (label/title already set via the create call;
     post the §5 comment is optional since the body carries it — a comment is fine too).

### B. `-m` not passed — flag for review

The PR is left open for review (normal non-merge end). Apply §4 + §5 to **both**:

- the **original issue** (the linked tracking / epic / sub issue) — skip if the run was
  instruction-only with no issue, and
- the **root PR** the skill created.

## 7. Cleanup — keep mac-deferred resources open

When handing the resource manifest to `/cleanup-resources`, tag anything carrying the `mac`
signal with `role: mac-deferred` and `keep-open: true`. The audit must **never** auto-close a
mac-deferred issue/PR — it is pending human verification on a Mac. (`/big-plan -m`'s cleanup
tail inherits this through the same manifest.)

## 8. Composition notes

- **Web:** every GitHub action above goes through the MCP per `github-ops.md` (push before PR
  ops; the case-A merge is the web merge `$WEB_BASE` → `$WEB_PARENT` via MCP with no
  branch-delete, per `web-mode.md` §5). Super-epic is already refused on web, so no
  interaction.
- **WSL / native Linux:** **not** a limited env — these self-verify (Playwright runs locally
  once Chromium + `--no-sandbox` are set up), so `LIMITED_ENV=false` and this handoff never
  fires there. They behave exactly like Mac.
- This file never changes *whether* a merge is allowed by CI, only whether the **local**
  verification gates it and what signal is left behind.
