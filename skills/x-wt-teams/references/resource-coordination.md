# Resource Coordination — Browser & Port Rules

Two HARD RULES that prevent parallel child worktrees from melting the local machine. Both apply manager-side AND child-side. The skill body keeps a one-line summary at the top and links here for the full pattern.

## Playwright / Browser Verification — Isolated Subagent Only

**HARD RULE**: Neither the manager nor any child agent may invoke `/headless-browser`, `/verify-ui`, or any other Playwright / Chrome DevTools-backed tool **directly**. Multiple concurrent browser-automation sessions (one per child worktree × N topics) will freeze the machine and burn huge token budgets.

**Why**: Playwright / Chrome DevTools each launch a real browser process. With up to 6 concurrent child agents (Step 5 concurrency cap), 6 simultaneous Chromium instances + their token-heavy trace/snapshot output overwhelm the local machine. Playwright tool calls also return large DOM / accessibility snapshots that balloon context windows fast.

### The rule

1. **Child agents**: NEVER invoke `/headless-browser` or `/verify-ui` directly. If a topic needs browser-based verification, the child agent commits its code and **reports back to the manager** that a browser check is requested (include the URL, what to check, and which selectors matter). The child does NOT run the check itself.
2. **Manager**: Also NEVER invokes `/headless-browser` or `/verify-ui` in its own context. Instead, spawn a **fresh dedicated Opus subagent** via the Agent tool, let that subagent run the browser tool, collect its result, and **kill the subagent immediately after** the single confirmation returns.
3. **One at a time, sequential only**: At most **one** browser-verification subagent may be alive across the entire workflow. Never spawn two in parallel — even if two topics want a UI check, queue them and run sequentially.
4. **Kill after each confirmation**: After the subagent returns its result, do not keep it alive for follow-up checks. Each verification gets its own fresh subagent. This prevents the Playwright / DevTools context from accumulating tokens across checks.

### Dispatch pattern

```
Agent tool:
  description: "UI verification via Playwright"
  subagent_type: "general-purpose"
  model: "opus"
  prompt: "You are a disposable UI-verification subagent for the /x-wt-teams workflow.
           Target URL: <url>
           Branch under test: base/<project-name>
           What to verify: <specific checks — e.g., 'confirm .sidebar width is 240px',
                          'screenshot the /settings page and confirm the new toggle is visible'>

           Use /verify-ui (for computed-style checks) or /headless-browser
           (for screenshots / interactions), whichever fits.
           Return a concise PASS/FAIL report with evidence (computed values,
           screenshot path, or error excerpt).
           Do NOT attempt to fix any issues you find — only report them.
           The manager will dispatch fixes separately.

           Keep the report under 200 words."
```

After the Agent call returns, the subagent is automatically torn down. Do not re-use it — spawn a new one for the next verification.

**Applies to all browser tooling**: `/verify-ui`, `/headless-browser`, any Playwright MCP, any Chrome DevTools MCP, and any future tool that launches a real browser. When in doubt, route through the isolated subagent.

## Port-Based Servers & Heavy Local Tests

Parallel child worktrees can fight over the same port (multiple `pnpm dev` on :3000) or thrash the CPU (heavy integration suites running concurrently). Two rules prevent this.

### Rule 1 — Defer heavy & port-binding tests to the manager

Child agents must NOT run:

- Full e2e / integration test suites that bind ports or spawn servers
- Playwright / browser-based tests (already covered above)
- Long-running build-and-test cycles (`pnpm build` + full test run, production server boots, etc.)
- Any `pnpm dev` / `npm run dev` / `vite` / similar dev-server process held open for verification

Instead, the child:

1. Commits its code locally (per the push-forbid rule)
2. Reports back to the manager with: "integration check needed — URL/endpoint, what to verify, branch name"
3. Manager runs these sequentially on the merged base branch after Step 6. The natural homes are Step 9 (quality assurance on the base) and, for UI-specific checks, Step 10 (`/verify-ui` via the isolated browser subagent pattern)

Child agents CAN run: unit tests, type-check, lint, component tests, and anything that does NOT bind a port. These are fast and do not conflict across worktrees.

### Rule 2 — `flock` serialization for legitimate short port work

If a child genuinely must bind a port during implementation (e.g., 10-second smoke test of a new API route), serialize across worktrees with `flock`. All worktrees share the host filesystem, so one lock file per port is sufficient. This is the escape hatch, NOT the default — prefer Rule 1.

**Pattern** (child agents use this in their bash scripts):

```bash
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
LOCK_DIR="/tmp/x-wt-teams-${REPO_NAME}-locks"
mkdir -p "$LOCK_DIR"
(
  flock -w 600 9 || { echo "port lock timeout after 600s"; exit 1; }
  PORT=3000 pnpm dev &
  SERVER_PID=$!
  # ... quick check (under a minute) ...
  kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
) 9>"$LOCK_DIR/port-3000.lock"
```

**Rules for child agents using `flock`:**

- Hold the lock for the shortest possible time (start → check → stop → release)
- ALWAYS kill the server inside the locked block — a zombie server steals the port from the next waiter
- Never hold a lock across a > 5-minute operation; redesign the check if it takes longer
- One lock file per port number (e.g., `port-3000.lock`, `port-5173.lock`) — do NOT share one file for multiple ports
- `flock` releases automatically on subshell exit (including on process kill), so stale locks are self-healing

**Manager responsibility:**

- Lock files live under `/tmp/x-wt-teams-<repo-name>-locks/` — outside the repo, no `.gitignore` concern
- When the workflow ends or aborts, the locks clear themselves (flock on subshell exit). No manual cleanup required
- If a child reports a port-lock timeout (600s exceeded), that means another child held the port too long — treat as a bug in that child's logic, not a resource-contention fact of life

### Decision rule

If you're reaching for `flock`, first ask: "Could I defer this to the manager instead?" If yes, do that (Rule 1). `flock` is only for cases where the check genuinely must run in the child context during implementation.
