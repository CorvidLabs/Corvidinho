---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: requirements
---

# Requirements

- SAFE-4 (captured, `hi/safe.md`): "Destructive data ops (raw SQL wipes,
  memory deletes) need a two-phase confirm so a single confused tool call
  cannot erase the store." Built here: the shell and runner half — a shell
  or runner call has no second phase, so it never wipes or overwrites the
  store; the only delete path stays the two-phase `memory-forget` /
  `memory-override`.
- Kept: REQ-plugins-011 (two-phase forget / override, unchanged),
  SAFE-3 / SAFE-3.a (the clamp, owner-only shell and runners), SAFE-21 /
  SAFE-21.a / SAFE-21.b (foot-guns with their families, order and messages;
  credential-free env), AGENT-18.a (lifecycle refusal first), AUTONOMY-9
  (prod asks; a refused call raises no card).
- Added: REQ-plugins-404.
- No env var, config key, slash command, must-ask class, NDJSON field,
  protocol or schema change.
