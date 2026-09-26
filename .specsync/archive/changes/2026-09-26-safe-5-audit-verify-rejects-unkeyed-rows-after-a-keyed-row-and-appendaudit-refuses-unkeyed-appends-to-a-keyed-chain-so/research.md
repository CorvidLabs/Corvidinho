---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: research
---

# Research

- `link()` hashes `keyed` into the payload, but the attacker rewrites it along with the hash, so the flag itself proves nothing; only the HMAC does.
- Editing keyed row N changes its hash, so a keyed row N+1 cannot be relinked without the key; the attacker has to downgrade N..end. Requiring "no unkeyed row after a keyed row" therefore catches any edit that leaves a keyed row in front of it.
- Writers: `runPlugin` (`recordAudit`, key from the process env) and the bridge `/admin` path (key from the bridge env). A process sharing the data dir without the key would append an unkeyed row after keyed ones; `docs/DISCORD-GO-LIVE.md` already says to set the same key on every process that shares the data dir. With the verify fix alone such a row would leave the chain permanently BROKEN, so the append side must refuse it.
- `runPlugin` already turns an append error for the `started` row into a fail-closed refusal (`audit log unavailable`); denials and ok/error rows are best-effort.
- A legitimate operator path is "run unkeyed, then set the key": an unkeyed prefix followed by keyed rows. That must keep verifying as mixed.
