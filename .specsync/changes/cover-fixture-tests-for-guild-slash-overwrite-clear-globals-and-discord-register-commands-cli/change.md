---
id: cover-fixture-tests-for-guild-slash-overwrite-clear-globals-and-discord-register-commands-cli
state: implementing
type: documentation
base_commit: 4c2b3a52279d8b76bb0ecc3701357e21c4927d5c
---

# Cover fixture tests for guild slash overwrite + clear-globals and discord register-commands CLI

## Intent

Cover fixture tests for guild slash overwrite + clear-globals and discord register-commands CLI

## Affected Canonical Specs

- None

## Acceptance Criteria

- tests/discord.register-commands.test.ts and tests/discord.bridge.cli.test.ts covered by this documentation cover change; bun test green; no module AC change

## No-spec Rationale

Fixture tests for REQ-discord-016 put order + CLI register-commands missing-token; no new module AC beyond already-shipped REQ-discord-016/REQ-cli-008
