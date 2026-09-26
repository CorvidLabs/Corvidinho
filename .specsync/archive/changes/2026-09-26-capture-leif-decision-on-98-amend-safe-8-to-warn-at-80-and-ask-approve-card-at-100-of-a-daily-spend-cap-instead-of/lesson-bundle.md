# Lesson bundle — capture-leif-decision-on-98-amend-safe-8-to-warn-at-80-and-ask-approve-card-at-100-of-a-daily-spend-cap-instead-of

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif decision on #98: amend SAFE-8 to warn at 80% and ask (Approve card) at 100% of a daily spend cap instead of refusing
- **Kind**: Documentation
- **Paths**: hi/safe.md
- **Acceptance**: hi/safe.md SAFE-8 reads warn at 80%, ask at 100% (Approve card); hi check passes

## Evidence

- Verification commit: `55576d0c83e48c597c4b0dd7a704fce783739b69`
- Base commit: `3625075b24331b1aecb1a2769a9a11b28d1e9ef6`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Leif's recorded decision on issue #98 (2026-09-26): at 100% of a spend cap the agent asks (an Approve card to continue) rather than refusing; update SAFE-8 to match: warn at 80%, ask at 100%. The hi CLI refuses to recapture an existing id, so the SAFE-8 line is amended in place (id unchanged) with a dated note.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
