---
name: commits-forbid
description: >-
  Disable automatic committing. From now on, do NOT make commits unless the user explicitly asks.
  Used during try-and-error development where the user is exploring implementation directions. Use
  when: (1) User says 'commits forbid', 'no auto commit', 'don't commit automatically', (2) User
  wants to experiment without committing.
---

# Commits Forbid

From now on, do NOT make commits automatically. Making commits without explicit user permission is not allowed. Only commit when the user explicitly asks (e.g., via `/commits`).

This mode is for try-and-error development where the user is exploring different implementation directions and doesn't want intermediate work committed.
