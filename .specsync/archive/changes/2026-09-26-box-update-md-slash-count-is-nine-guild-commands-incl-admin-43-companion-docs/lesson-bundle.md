# Lesson bundle — box-update-md-slash-count-is-nine-guild-commands-incl-admin-43-companion-docs

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: BOX-UPDATE.md slash count is nine guild commands incl. /admin (#43 companion docs)
- **Kind**: Documentation
- **Paths**: docs/BOX-UPDATE.md
- **Acceptance**: docs/BOX-UPDATE.md step 3 tells operators to expect nine guild commands including /schedule, /announce and /admin; SpecSync change audit green on this PR

## Evidence

- Verification commit: `3b5d39b31393c044cddc284f5030b0be996040e5`
- Base commit: `92359247c1841bed84b9298ad1d75b17faaf409f`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The `/admin` change on this PR (issue #43, REQ-discord-009/016) raises the
registered slash set from eight to nine. `docs/BOX-UPDATE.md` step 3 ("Discord
slash ghosts / duplicates") still told operators to expect eight guild
commands after a deploy, so an operator following it would see nine and think
something was wrong. `docs/BOX-UPDATE.md` sits outside the approved path scope
of the `/admin` change, so this companion docs change covers the one-line
count fix. No behavior change.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
