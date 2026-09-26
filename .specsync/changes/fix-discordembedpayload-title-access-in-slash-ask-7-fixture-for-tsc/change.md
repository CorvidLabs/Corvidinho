---
id: fix-discordembedpayload-title-access-in-slash-ask-7-fixture-for-tsc
state: approved
type: bug_fix
base_commit: d40400015fdcb4ae5b7ccfc19a2a8fc7b20a7cff
---

# Fix DiscordEmbedPayload title access in slash ASK-7 fixture for tsc

## Intent

Fix DiscordEmbedPayload title access in slash ASK-7 fixture for tsc

## Affected Canonical Specs

- None

## Acceptance Criteria

- tsc --noEmit clean; slash-ask7 tests still pass without referencing DiscordEmbedPayload.title.

## No-spec Rationale

Typecheck-only fix in existing slash ASK-7 fixture; no REQ delta
