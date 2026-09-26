---
module: discord
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
---

# Delta — discord (shared store: spend ledger scrub targets, issue #98)

## Added

### REQUIREMENT REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` table
(created by `src/agent/spend.ts` with CREATE TABLE IF NOT EXISTS, no schema
version bump) like every other persisted table under SAFE-6: its free-text
`provider` and `model` columns SHALL be written through `scrubSecrets` and
SHALL be listed in `SCRUB_TARGETS`, so a scrub-rules re-scrub also covers
them.

Acceptance Criteria
- A ledger row written with a vendor-key-looking provider or model persists redacted.
- `SCRUB_TARGETS` contains `spend_ledger` with `provider` and `model`.
- `rescrubDatabase` re-scrubs a raw `spend_ledger` row.
