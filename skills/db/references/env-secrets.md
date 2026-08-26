# `$DROPBOX_ROOT/env/` — shared dev credentials

Per-project throwaway credentials for personal dev: test accounts, staging tokens, operator inputs. Layout is one directory per project:

```
env/
  <project-slug>/
    secrets.txt
    operator-inputs-staging.json
```

Dropbox sync is the whole point — the same secrets are present on every machine without a manual copy step, which is the same reason `cclogs` lives in Dropbox.

## Handling rule: move the value, never print it

**Do not `cat` a secret into the conversation.** File-read permission is not the boundary that matters here — an agent that can read `env/` can read `$HOME/.ssh` too, so hiding the directory buys nothing. The boundary that *is* real is the transcript: anything printed enters the conversation, goes to the API, and is written into session logs — which are themselves Dropbox-synced. That turns one stored secret into several uncontrolled copies.

So keep the value inside a single shell invocation, where it passes through the process and not the context:

```bash
# Good — value never reaches the transcript
cp "$DROPBOX_ROOT/env/<project>/.env" ./.env.local
TOKEN=$(grep '^API_TOKEN=' "$DROPBOX_ROOT/env/<project>/secrets.txt" | cut -d= -f2-) \
  && curl -sH "Authorization: Bearer $TOKEN" https://api.example.com/ping

# Bad — value is now in the transcript, the API log, and cclogs
cat "$DROPBOX_ROOT/env/<project>/secrets.txt"
```

When the user genuinely needs to *see* a value, print only the field they asked for, and say plainly that it is now in the transcript.

Read the filenames freely — listing `env/<project>/` to learn what exists is not a leak, and is usually all that is needed to wire something up.

## What belongs here

Only credentials whose worst case is "recreate a test account": dev/staging tokens, seeded test logins, sandbox API keys.

Not here: anything touching money or production, anything on a shared or employer account, anything that would be painful to rotate. Dropbox keeps version history, so a secret deleted today is still recoverable from the cloud for weeks — deletion is not rotation. Rotate at the issuer.

## If this needs to be stronger

The user has 1Password CLI installed (`op` 2.34.0). `op run` is the one option that is genuinely better rather than differently-shaped, because it keeps the value out of the agent's context entirely — the reference resolves inside the child process:

```bash
# .env, safe to commit: references, not secrets
API_TOKEN=op://Dev/example-api/credential

op run --env-file=.env -- pnpm dev     # $API_TOKEN exists only in the subprocess
op inject -i config.tpl -o config.json # same idea for config files
```

**The blocker is account scope, not tooling.** The only signed-in account is `pxgrid.1password.com` (work). Personal dev secrets do not belong in an employer vault — that trades a small technical risk for a policy problem. This becomes the better option once a personal 1Password account is added (`op account add`), not before.

Meanwhile the Dropbox `env/` pattern is a deliberate, reasonable trade for low-stakes personal work — provided the print rule above holds, since that is where the real exposure is.
