---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: research
---

# Research

- `src/discord/agent-client.ts` always overwrites
  `CORVIDINHO_ACTING_DISCORD_USER_ID` on a Discord spawn (empty when there is no
  actor); `src/watch/agent-client.ts` clears it; a local `task run` or operator
  `plugins run` normally has it unset. Other readers: `plugins/memory/commands.ts`
  (acting user for memory ACL) and `src/audit/log.ts` (audit actor).
- `verifyRequesterCanSend` (live path) logs in a short-lived discord.js client
  with the Guild Members intent. Without Server Members Intent in the portal the
  login is rejected (`Used disallowed intents`) and the function throws; a
  15 s login timeout also throws. A member that cannot be fetched returns
  `requester not in guild` (403), which already refuses. With
  `CORVIDINHO_DISCORD_DRY_RUN=1` and no injected checker the live check is
  skipped (nothing is posted in dry-run either).
- On `main`, a throw from the check propagates out of the handler and
  `runPlugin` rethrows it (the audit row records `error`).
- `formatErrorLine` (`src/store/scrub.ts`, CLI-4 / SAFE-6) gives one line:
  first line only, vendor-key shapes scrubbed, the literal value of any set
  secret env (`DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, …) redacted, capped.
- `tests/docs.operator-facts.test.ts` pins the go-live Server Members Intent
  sentence (`Server Members Intent** only if you use the DISCORD-8 requester
  check`, `--requesting-user-id`), so the doc edit keeps both.
