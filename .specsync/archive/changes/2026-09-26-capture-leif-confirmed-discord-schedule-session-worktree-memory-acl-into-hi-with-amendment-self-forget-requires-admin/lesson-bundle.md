# Lesson bundle — capture-leif-confirmed-discord-schedule-session-worktree-memory-acl-into-hi-with-amendment-self-forget-requires-admin

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif-confirmed DISCORD-SCHEDULE SESSION-WORKTREE MEMORY-ACL into hi/ with amendment self-forget requires ADMIN; cross-link #57 #58 #59
- **Kind**: Documentation
- **Paths**: hi, STATUS.md, AGENTS.md
- **Acceptance**: hi/discord.md has DISCORD-SCHEDULE-1..5; hi/session.md has SESSION-WORKTREE-1..5; hi/memory.md has MEMORY-ACL-1..5 with self-forget requiring ADMIN; hi/admin.md cross-links MEMORY forget to ADMIN; STATUS/AGENTS note capture; hi check clean; no invented AC; no impl code

## Evidence

- Verification commit: `52362206b959fd0e21131f58a45ef9c692a3a187`
- Base commit: `59a92f9aa95a71e27e23d21967ff6afa4a209c3f`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Leif confirmed (2026-09-26 America/Denver) the CoS fan-out HI draft for
DISCORD-SCHEDULE-1..5, SESSION-WORKTREE-1..5, and MEMORY-ACL-1..5.

**Amendment:** MEMORY self-forget also requires ADMIN (not only cross-user
forget/override). Draft path
`/workspace/corvidinho-hi-draft-schedule-worktree-memory.md` is superseded by
this capture into live `hi/`.

Impl trackers already open: #57 schedule, #58 worktree, #59 memory ACL.
This change is HI-capture only — no schedule/worktree/memory ACL code.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
