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
- **MEMORY-5**  For each person it keeps their role, projects, preferences, and a history of decisions, asks and approvals.
- **MEMORY-6**  Each project has memory that is there the next time anyone works on the repo.
- **MEMORY-7**  Memory about a person is private to them and me by default, and private notes are never shown to others.
  - **MEMORY-7.a**  Private notes, profile reads and my view of someone's memory are shown only privately to that person or me, never in a shared channel.
- **MEMORY-8**  It saves and recalls facts in Discord and GitHub conversations, filed by person or project.
- **MEMORY-9**  It searches memory before saying it doesn't know.

- **MEMORY-ACL-1**  Memories are scoped to the acting user (Discord user id / configured identity); reads and writes default to that user’s scope only.
- **MEMORY-ACL-2**  A non-admin cannot forget, delete, overwrite, or re-attribute another user’s memories — attempts are refused without leaking the other user’s content.
- **MEMORY-ACL-3**  Only ADMIN (re-checked at handler time per **ADMIN-4** / **DISCORD-7**) may forget or override another user’s memories, with an audit-friendly reply.
- **MEMORY-ACL-4**  Empty admin/owner lists stay deny-all for forget/override. **Self-forget of one’s own memories also requires ADMIN** (Leif amendment 2026-09-26) — there is no non-admin forget path.
- **MEMORY-ACL-5**  No on-chain memory ACL; local SQLite only (**MEMORY-3**). Cross-link #41 MEMORY impl and closed duplicate #35.
- **MEMORY-ACL-6**  Anyone can ask to be forgotten, and it forgets once I approve on a card.
  - **MEMORY-ACL-6.a**  Someone known only on GitHub can ask there to be forgotten, and I can start it for any declared person with /admin; either way it forgets only after I approve on the card.
