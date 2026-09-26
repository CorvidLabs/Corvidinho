---
hi-draft: 1
families: [MEMORY, AGENT]
owner: leif
status: confirmed-captured-see-hi
issue: 41
---

# MEMORY (draft) — SQLite persistence

> **CAPTURED.** Leif confirmed; live criteria are in `hi/`. This file is historical provenance only.
> Issue: [#41](https://github.com/CorvidLabs/Corvidinho/issues/41). Steals AGENT-7 flesh from corvid-agent local SQLite. **No on-chain.**

## Intent

Corvidinho should remember conversations, entities, people, and personality notes across turns on the Linux box — local SQLite, not a blockchain and not a second brain with different rules.

## Proposed criteria (for Leif)

- **MEMORY-1**  Durable facts I ask it to keep for this project (and small conversation summaries) survive process restarts in a local SQLite store — fleshes **AGENT-7**.
- **MEMORY-2**  It can store and recall **people / entities** (display name, platform links) without inventing identity product surfaces.
- **MEMORY-3**  It can keep short **personality / preference** notes that shape later turns, without requiring the full autonomous persona suite.
- **MEMORY-4**  Destructive memory wipes still respect **SAFE-4** (two-phase confirm) and stay off the default path.
- **MEMORY-5**  No on-chain / ARC69 / attestation path in v1; those stay deferred with #9-class product surfaces.

## Provenance (steal, do not invent)

Archived corvid-agent: `server/memory/` (skip arc69/attestation/graduation), `server/db/agent-memories.ts`, `schema/memory.ts`, contacts/entities (#36), session summaries (#37). See issue #41 comments.

## Non-goals

Inventing HI into `hi/` before confirm; Trust re-add; MainNet memory.
