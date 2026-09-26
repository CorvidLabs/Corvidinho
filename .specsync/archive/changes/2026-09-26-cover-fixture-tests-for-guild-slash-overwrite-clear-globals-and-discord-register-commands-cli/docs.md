---
change: cover-fixture-tests-for-guild-slash-overwrite-clear-globals-and-discord-register-commands-cli
artifact: docs
---

# Docs

No operator-facing doc change. Fixture coverage:
- `tests/discord.register-commands.test.ts` — guild PUT then global `[]`
- `tests/discord.bridge.cli.test.ts` — `discord register-commands` missing token
