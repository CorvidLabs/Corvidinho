---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` E.3 plugin table: the `shell-exec` row says it
  refuses SQL clients and writes on Corvidinho's own store (SAFE-4) and the
  runner row that argv naming the store is refused; the two duplicated
  `shell-exec` / runner rows a merge left behind (SAFE-21.b and AGENT-18.a
  each added one) are folded into one row each, keeping every fact.
- `docs/discord.md` Memory: the shell and runners never wipe or overwrite
  the store; only `memory-forget` / `memory-override`, behind the owner's DM
  card with Approve and a one-time code (SAFE-18.a), do. The SAFE-4 refusal
  (`STORE_INSTEAD`) says the same.
- `specs/plugins/plugins.spec.md`: purpose, public API, the SAFE-4 shell and
  runner paragraph with its residual, AUTONOMY-9 note, scenario, error
  rows, files list. README, STATUS and CHANGELOG are not made false by this
  change (release notes come with the next release PR).
