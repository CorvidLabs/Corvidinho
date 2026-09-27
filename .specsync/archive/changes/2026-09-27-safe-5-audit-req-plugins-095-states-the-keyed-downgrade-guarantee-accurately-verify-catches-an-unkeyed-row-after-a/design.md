---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: design
---

# Design

- REQ-plugins-095 (delta `deltas/plugins.md`, Modified, full text): the
  keyed-stays-keyed rule is kept; the claim is narrowed to "a keyed row cannot
  be relinked as plain SHA-256 while a keyed row before it stays", and one
  sentence says that rewriting every keyed row from the first keyed row on,
  or dropping the newest rows, is not detectable from the DB alone and needs
  an anchor kept outside the DB. The relink acceptance criterion names "a
  keyed row that follows a keyed row".
- `specs/plugins/plugins.spec.md`: the SAFE-5 audit-chain paragraph gets the
  same limit; version 45; change-log row.
- `src/audit/log.ts`: module comment only, same wording. No code change.
- `docs/DISCORD-GO-LIVE.md` E.7 audit-key row: once the chain holds a keyed
  row, a process without the key refuses dangerous plugin runs and `/admin`
  changes, and an unkeyed row after a keyed row reads as `chain BROKEN at #N`.
- The out-of-DB anchor itself is not designed here: it is new product surface
  that needs a captured HI want first.
