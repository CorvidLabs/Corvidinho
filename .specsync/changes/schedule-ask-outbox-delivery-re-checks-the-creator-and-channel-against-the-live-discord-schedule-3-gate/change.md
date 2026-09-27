---
id: schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate
state: draft
type: bug_fix
base_commit: c8988b98e0d872847a16f711cde337277a027b66
---

# Schedule ask outbox delivery re-checks the creator and channel against the live DISCORD-SCHEDULE-3 gate

## Intent

Schedule ask outbox delivery re-checks the creator and channel against the live DISCORD-SCHEDULE-3 gate

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A daemon-claimed schedule ask is delivered only while the creator and channel pass the live DISCORD-SCHEDULE-3 gate; a refused one stays pending and posts once allowed again; regression test fails with the channel-only check

## No-spec Rationale

Not applicable
