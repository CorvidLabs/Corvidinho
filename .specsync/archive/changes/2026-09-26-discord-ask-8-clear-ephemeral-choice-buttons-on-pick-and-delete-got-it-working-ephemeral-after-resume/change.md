---
id: discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume
state: archived
type: feature
base_commit: 4f489b6c11c4b1665c3f5e1c4c06348042d5be17
---

# DISCORD-ASK-8: clear ephemeral choice buttons on pick and delete Got-it Working ephemeral after resume

## Intent

DISCORD-ASK-8: clear ephemeral choice buttons on pick and delete Got-it Working ephemeral after resume

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Pick update clears components ([]); pendingAsk null before resume; re-press no second resume; deleteReply called after resume when available. HI DISCORD-ASK-8 + REQ-discord-049. tests/discord.ask-ephemeral.test.ts covers.

## No-spec Rationale

Not applicable
