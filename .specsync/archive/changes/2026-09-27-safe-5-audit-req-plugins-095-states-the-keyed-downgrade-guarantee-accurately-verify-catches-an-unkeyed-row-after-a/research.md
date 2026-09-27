---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: research
---

# Research

- `src/audit/log.ts`: `verifyAudit` walks rows from genesis; the new
  `downgraded` check only fires when a keyed row was already seen. A keyed
  row's HMAC covers `prev_hash`, so an unkeyed prefix before the first keyed
  row is authenticated by it; rows after the last keyed row cannot exist
  after the PR (keyless append refused).
- Whole-chain downgrade: the attacker knows every row's content, so it can
  recompute row 1 onward as SHA-256 links with `keyed = 0`. No keyed row is
  left, so the `downgraded` check never fires. A later keyed append then
  signs on top of the forged chain (`mixed keyed/unkeyed`).
- Tail truncation (dropping the newest rows) is also invisible from the DB.
- Other writers/readers: only `runPlugin` (`src/plugins/run.ts`) and the
  bridge `/admin` path (`src/discord/bridge.ts`,
  `src/discord/command-handlers/admin.ts`) append; only the bridge verifies.
  Both append paths already fail closed on a throw. Delegate workers drop the
  key but `task run` never offers dangerous tools, so they do not hit the new
  refusal.
