---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: design
---

# Design

- `src/store/scrub.ts`: `scrubSecrets`, `scrubOpt`, `SCRUB_TARGETS`,
  `rescrubDatabase`, `ensureScrubbed`, `SCRUB_RULES_VERSION`.
- Scrub at the persist boundary (SQL params), so in-memory objects for a live
  run are unchanged; what reaches disk is scrubbed. Memory store scrubs key +
  content before the upsert lookup.
- No schema change: the rules version lives in `schema_meta`.
