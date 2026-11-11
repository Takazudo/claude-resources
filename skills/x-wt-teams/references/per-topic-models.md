# Per-topic model resolution

Apply [the canonical model policy](../../.shared/model-policy.md). Reviewer and
manager settings are separate from workers.

Resolve each topic in order: explicit scoped user choice; manager revision based
on task/test evidence; valid planner `**Model:**` annotation; Sonnet default with a
missing/invalid-marker diagnostic. Preserve exact `opus|sonnet|haiku|fable` values
and the ` — non-empty reason` suffix, including legacy inline annotations.
Do not rewrite legacy annotations merely to change defaults.

At either Agent spawn path, pass the supported per-child `model` field. Inspect the
actual runtime schema before passing effort or inheritance controls; teams and
non-fork agents can differ. Use the policy's provider-specific recommendations and
record inherited/unknown effort when no override is supported. Preserve user
settings that take precedence. Never claim the manager is automatically Opus.

Before dispatch give one brief reason, for example `Worker: Sonnet/medium — specified
feature and acceptance tests (requested)`. Record actual settings only when observed,
including provider substitutions. Unsupported/unavailable requests follow the
policy's disclosed, validated bounded-fallback rules; strict requirements and
unresolved high-risk work stop/report. There is no new workflow model flag: accept
explicit natural-language scoped choices and carry them in the handoff/ledger.
