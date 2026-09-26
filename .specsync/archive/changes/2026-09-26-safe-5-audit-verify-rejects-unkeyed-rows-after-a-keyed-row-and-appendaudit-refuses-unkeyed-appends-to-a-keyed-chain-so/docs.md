---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: SAFE-5 audit-chain invariant (once keyed, stays keyed), a new error row for a keyless dangerous run on a keyed chain, and `tests/audit.keyed-downgrade.test.ts` in the files list.
- `specs/plugins/requirements.md`: REQ-plugins-095 text and acceptance criteria match the delta.
- No operator docs change: `docs/DISCORD-GO-LIVE.md` already says to set the same `CORVIDINHO_AUDIT_HMAC_KEY` on every process that shares the data dir, and the `/status` audit line strings are unchanged. No CHANGELOG/STATUS edit (bug-fix slice).
