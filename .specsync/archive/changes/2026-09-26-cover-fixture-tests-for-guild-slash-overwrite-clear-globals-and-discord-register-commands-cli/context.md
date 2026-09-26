---
change: cover-fixture-tests-for-guild-slash-overwrite-clear-globals-and-discord-register-commands-cli
artifact: context
---

# Context

Cover change for SpecSync path audit: `tests/discord.register-commands.test.ts`
and `tests/discord.bridge.cli.test.ts` were added with the guild PUT + clear-globals
fix but were outside the parent change's `--path` list. No new acceptance criteria.
