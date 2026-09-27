---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: tasks
---

# Tasks

- [x] Reproduce first-keyed-row relink passing verify with the key on the PR head.
- [x] REQ-plugins-095 text + relink acceptance criterion narrowed (`specs/plugins/requirements.md`, `deltas/plugins.md`).
- [x] `specs/plugins/plugins.spec.md` SAFE-5 paragraph, version 45, change-log row.
- [x] `src/audit/log.ts` module comment.
- [x] `docs/DISCORD-GO-LIVE.md` audit-key row.
- [x] Regression test in `tests/audit.keyed-downgrade.test.ts` (legacy unkeyed prefix, last keyed row relinked unkeyed).
- [x] Checks green.
