---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: tasks
---

# Tasks

- [x] Regression tests for the acting-user check (deny, allow, mismatched requesting id, strict, check cannot run, live login refused, allowlist first, acting env empty/unset unchanged); new cases fail on `main`.
- [x] `discord-post-message` checks the acting user, refuses a mismatched requesting id, and fails closed with one scrubbed line when the check cannot run.
- [x] Delta modifies REQ-discord-012; canonical requirements, spec invariant, error row and testing notes updated.
- [x] Docs updated: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `.env.example`.
- [x] specsync check, tsc, bun test, fledge verify green.
