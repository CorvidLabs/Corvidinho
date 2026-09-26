---
hi: 1
families: [MEMORY]
owner: leif
---

# Memory

## Intent

Corvidinho keeps conversations, people, entities, and personality notes in a local SQLite store on the Linux box so they survive restarts — not on a chain and not in Trust or Augur.

## Criteria

- **MEMORY-1**  Conversations I have with it persist in a local SQLite database under `~/.local/share/corvidinho/` so they are still there after the process exits.
- **MEMORY-2**  It can store and recall entities, people, and personality notes in that same local store.
- **MEMORY-3**  Memory stays local SQLite only — no on-chain memory path and no Trust or Augur involvement.
- **MEMORY-4**  After a restart it reloads what it already stored so prior conversations and notes are available again.
