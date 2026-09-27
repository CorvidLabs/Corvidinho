---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: design
---

# Design

- Reuse the `/admin` pattern and the existing `SlashContext.recordAudit` (the
  bridge already wires it to `appendAudit` on the shared DB with
  `CORVIDINHO_AUDIT_HMAC_KEY`): no new context field, env var or schema.
- `handleDelete`: after the id resolves, append `started` (action
  `schedule-delete`, surface `discord:schedule`, actor = invoker id,
  `argsDigest(["delete", <resolved id>])`). If that throws or `recordAudit` is
  unset, reply `Refused: audit log unavailable (SAFE-5): <reason>. Nothing
  changed.` and return without deleting. Then delete; a throw (or `false`)
  appends `error` best effort and replies with the error; success appends `ok`
  best effort and the reply names `#<started> started · #<ok> ok` (or says the
  ok row was not recorded, as `/admin` does).
- A non-ADMIN `/schedule delete` appends `denied` best effort before the
  `not authorized` reply, as `/admin`'s handler re-check does.
- Missing or unknown ids delete nothing and append nothing (no destructive
  action was attempted).
- Design choice pending Leif: only `delete` is audited. `create`, `pause` and
  `resume` do not destroy data (pause/resume are reversible and create adds a
  row), so they stay unaudited; SAFE-5 names destructive actions only.
- Design choice pending Leif: a bridge without an audit trail (no DB; in
  practice only test harnesses that inject stores) refuses `/schedule delete`
  rather than deleting unaudited, matching `/admin` (REQ-discord-043).
- The small `auditSoft` helper is repeated in `schedule.ts` rather than moved
  out of `admin.ts`, so `/admin` is untouched by this slice.
