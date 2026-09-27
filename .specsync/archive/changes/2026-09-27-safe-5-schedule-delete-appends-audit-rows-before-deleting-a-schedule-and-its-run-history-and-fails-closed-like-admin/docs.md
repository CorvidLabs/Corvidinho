---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: docs
---

# Docs

- `docs/discord.md`: the `/schedule delete` row says it deletes the schedule
  and its run history, appends SAFE-5 `started` then `ok`/`error` rows
  (surface `discord:schedule`), fails closed when the trail is unavailable,
  and a non-owner's delete appends `denied`.
- `docs/DISCORD-GO-LIVE.md` E.7: the audit chain row lists `/schedule delete`
  among what is recorded, and the audit key row says a process without the
  key also refuses `/schedule delete` on a keyed chain.
- `specs/discord/discord.spec.md`: the `/schedule` invariant names the audit
  rows and fail-closed rule; the Error Cases table gains the `/schedule delete`
  audit-unavailable row.
- `specs/discord/requirements.md` / `specs/discord/testing.md`: REQ-discord-020
  text and evidence match the delta.
- No CHANGELOG version section, STATUS or package bump (bug-fix slice).
