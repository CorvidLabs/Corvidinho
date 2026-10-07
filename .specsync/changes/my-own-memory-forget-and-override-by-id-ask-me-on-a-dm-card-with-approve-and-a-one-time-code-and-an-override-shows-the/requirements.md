---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: requirements
---

# Requirements

- SAFE-18 (on main, `hi/safe.md`): "When it needs my OK, it DMs me an
  Approve/Deny card with the exact action, target, amount, and diff or text."
- SAFE-18.a (captured in this PR with `hi`, Leif's 2026-09-28 interview,
  round 17): "My own memory forget and override by id ask me on a DM card with
  Approve and a one-time code, and an override shows the new text word for
  word."
- Binding on main: SAFE-4 (two-phase confirm for memory deletes — the card is
  it), SAFE-5 (audit trail), SAFE-6 (scrub), SAFE-19 (one-time code: once,
  only that action, short expiry), SAFE-20 (no answer / late = no),
  MEMORY-ACL-3 (audit-friendly reply), MEMORY-ACL-4 / IDENTITY-2 (owner-only).
- Interview design calls: reuse the engine's destructive class with the
  SAFE-19 code; the card shows action (forget / override), target
  (category/key/owner scope/id) and for override the new text verbatim
  (scrubbed, fence-safe); Approve with the code runs it, Deny / lapse = nothing;
  the typed token path is removed for these owner flows; the audit trail
  stays; with no running bridge (local CLI) fail closed with a clear line, no
  token fallback.
- Added: REQ-plugins-183 (the handler flow), REQ-discord-183 (the `memory`
  kind, bridge registration, `src/memory/card.ts`), REQ-agent-183 (the memory
  tools' argv hint names the card, not `--confirm`). Modified: REQ-plugins-011
  (two-phase is now the card; `--confirm` refused), REQ-discord-021 (the
  spawn clears `CORVIDINHO_ACTING_CONFIRM_TOKENS`), REQ-plugins-010 (forget /
  override need the owner's card, not a token) and REQ-discord-128
  (`humanText` is still passed, but no confirm token reaches a run). Left
  as is to avoid clashing with #405's active change of the same requirement:
  REQ-discord-072's aside that `humanText` is "the only source of SAFE-4
  confirm tokens".
- No new env var, config key, slash command, table or schema version.
