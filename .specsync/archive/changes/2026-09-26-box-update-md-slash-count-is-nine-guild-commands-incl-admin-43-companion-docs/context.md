---
change: box-update-md-slash-count-is-nine-guild-commands-incl-admin-43-companion-docs
artifact: context
---

# Context

The `/admin` change on this PR (issue #43, REQ-discord-009/016) raises the
registered slash set from eight to nine. `docs/BOX-UPDATE.md` step 3 ("Discord
slash ghosts / duplicates") still told operators to expect eight guild
commands after a deploy, so an operator following it would see nine and think
something was wrong. `docs/BOX-UPDATE.md` sits outside the approved path scope
of the `/admin` change, so this companion docs change covers the one-line
count fix. No behavior change.
