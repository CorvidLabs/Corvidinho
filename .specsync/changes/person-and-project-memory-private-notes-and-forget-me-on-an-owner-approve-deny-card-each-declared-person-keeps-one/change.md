---
id: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
state: verifying
type: feature
base_commit: 89f79769b75713829f816c812052393472733084
---

# Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101)

## Intent

Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101)

## Affected Canonical Specs

- `discord`
- `plugins`
- `agent`

## Acceptance Criteria

- A declared person's memory is one profile keyed by their declared person id (person:<id>), reached from every Discord id the owner linked to them and still reading rows stored under those ids before they were declared, holding their projects, preferences and a history of their decisions, asks and approvals (memory-store --category project|preference|decision|ask|approval; memory-profile shows role from the people list, projects, preferences, history newest first, private notes counted only), while undeclared users keep today's Discord-id scope (MEMORY-5, MEMORY-ACL-1..5 unchanged); each project keeps memory keyed by its repo (origin owner/repo lowercased with no credentials, else the main checkout path, shared by every talk worktree) that the owner, team and the local CLI read and write with --project and that owner / team chat, button-pick and /work runs are given, never community, WATCH, schedules or workers (MEMORY-6); a person's memory is read only by them and the owner on every surface — the Discord inject holds only the speaker's own profile, --person on memory-recall / memory-profile works only in the owner's run and anyone else gets the opaque not authorized — and private notes are never injected or returned unless asked for by name by that person or the owner in a conversation (MEMORY-7); anyone can ask with memory-forget-me from a conversation (audited, one open ask per person, nothing deleted), the bridge DMs the owner a reusable Approve/Deny card (counts, never content) on every scheduler tick and after each chat message, only the owner's press on a pending unexpired card counts, Approve writes the SAFE-5 started row first (fail closed) then deletes in one transaction every memory row of that person and their session turns and tells both, and Deny, no answer within 24 h or a late press is a no that deletes nothing and tells the asker; the ask lives in forget_requests (schema v12 forward-only migration, ids and times only, no text to scrub) (MEMORY-ACL-6, SAFE-5, SAFE-6); tests/memory.profiles.test.ts and tests/discord.forget-card.test.ts cover each and fail on the stacked base sources

## No-spec Rationale

Not applicable
