# Heavy local tests — admission and deferral policy

Shared by Claude Code (`$HOME/.claude`) and Codex (`$HOME/.codex`). Both copies of this file and of
`scripts/heavy-guard.sh` are kept identical; both guards share one lock dir
(`$HOME/.agent-guard/heavy`), so a Claude session and a Codex session queue behind each other.

## The problem this solves

Several agent sessions on one machine each run a heavy suite (b4push, e2e / Playwright, a long
build). Two or three at once exhaust memory and the suites go red for reasons unrelated to the code.
Tests must stay machine-spec independent, so the fix does not go into the tests: the machine
knowledge lives in the **scheduler** (the guard), and the **verdict** on an environment-shaped
failure comes from CI or another machine.

## What counts as heavy

Full e2e / integration suites, anything that launches a browser, `b4push`, production builds
followed by a full test run, `cargo build/test --workspace`. Unit tests, type-check, lint, and
single-file test runs are NOT heavy — run them freely and never queue them.

## Rule 1 — every heavy run goes through the guard

```bash
bash "$HOME/.claude/scripts/heavy-guard.sh" -- pnpm test:e2e   # Claude Code
bash "$HOME/.codex/scripts/heavy-guard.sh"  -- pnpm test:e2e   # Codex
```

- A project whose `scripts/run-b4push.sh` already wraps its heavy steps (the `/dev-b4push`
  template) needs nothing extra — `pnpm b4push` is self-guarding, and nested calls are no-ops.
- One slot by default: heavy runs are a strict machine-wide queue. The guard also refuses to start
  until `HEAVY_GUARD_MIN_MEM_MB` (default 2048) is available. Tune per machine with
  `HEAVY_GUARD_SLOTS` / `HEAVY_GUARD_MIN_MEM_MB` in the shell profile — never per call, all callers
  must agree.
- **Run it in the foreground and wait.** A queued guard can sit for up to `--wait` (default 30 min)
  before it starts. Give the tool call a timeout that covers queue + run. A child / worker agent
  must never background it and end its turn (completion notices go to the manager, not the child).
- An agent that dies mid-run frees its slot automatically and its test tree is torn down. There is
  nothing to clean up and no lock to break — never delete files under `$HOME/.agent-guard`.
- This does not replace the per-workflow rule that children / workers hand heavy runs to the
  manager. That rule bounds one workflow; the guard bounds the machine.

## Rule 2 — read the verdict line before reading the failure

The guard's last stderr line:

```
heavy-guard: verdict=PASS|FAIL|ENV_SUSPECT exit=N secs=N min_mem_mb=N reason=...
```

| Outcome | Meaning | Do |
| --- | --- | --- |
| exit 75 | Queue or memory wait timed out. The suite never ran. | Retry later, or defer (Rule 3). Never bypass the guard. Never report as a test failure. |
| `ENV_SUSPECT` | Failed with an environment signature: exit 137 (OOM kill), exit 124 (`--max-run` expired), or memory dipped under the low-water mark. | Rerun ONCE — the guard already guarantees it runs alone. Green → it was starvation; move on, no issue. Red again → Rule 3. |
| `FAIL` | Failed with memory to spare. | A real failure. Fix it. Not deferrable. |

A failure that names a broken expectation — assertion diff, type error, lint error, missing
module, snapshot mismatch — is a real failure **even under `ENV_SUSPECT`**. Timeouts, browser
launch failures, `Target closed`, `ECONNREFUSED` to a server the suite starts itself, and a killed
process are the environment-shaped ones.

## Rule 3 — deferral: CI (or another machine) holds the verdict

When a heavy step cannot produce a trustworthy local result, do not block the workflow and do not
call it green. Defer it:

1. **Deferrable only if all hold:** (a) exit 75, or `ENV_SUSPECT` that stayed red on the solo
   rerun, or the step cannot run on this platform at all (a macOS-only step on WSL/Linux, and the
   reverse); (b) the failure output shows no broken expectation (Rule 2); (c) something else WILL
   run that exact step — a CI job that mirrors it, or the other machine.
2. **Record it.** Raise an issue labelled `deferred-verification` (create the label if missing)
   with: the exact command, the verdict line, the tail of the output, machine/OS, and which CI job
   or machine owes the result. In local / no-issue mode, write the same to the run's cclogs dir.
3. **Continue**, and list the deferred step in the final report as *deferred*, never as passed.
4. **Settle it.** CI green on that step → close the issue. CI red → it was a real failure all
   along; fix it under that issue. Steps owed to another machine stay open until run there.

If (c) fails — no CI job covers the step and no other machine will — it is not deferrable. Report
it as **unverified** and stop short of merging.

## What never to do

- Run a heavy suite unguarded because the queue is slow.
- Raise slots or lower the memory gate for one call to get through.
- Treat exit 75 or `ENV_SUSPECT` as a pass, or retry more than once hoping for green.
- Weaken the test (longer timeouts, fewer workers, skipped specs) to fit this machine. Machine
  limits are the scheduler's problem.
