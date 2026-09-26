---
id: cover-status-protocol-line-fixture-in-tests-discord-slash-test-ts-for-the-protocol-2-bump-issue-73-assertion-reads
state: archived
type: bug_fix
base_commit: 80e89c701bbdb527ad60fbe57e9300b44782da81
---

# Cover /status protocol-line fixture in tests/discord.slash.test.ts for the protocol 2 bump (issue #73); assertion reads CORVIDINHO_PROTOCOL_VERSION instead of a hard-coded 1; no module AC beyond REQ-discord-073

## Intent

Cover /status protocol-line fixture in tests/discord.slash.test.ts for the protocol 2 bump (issue #73); assertion reads CORVIDINHO_PROTOCOL_VERSION instead of a hard-coded 1; no module AC beyond REQ-discord-073

## Affected Canonical Specs

- None

## Acceptance Criteria

- tests/discord.slash.test.ts /status fixture asserts Protocol: ${CORVIDINHO_PROTOCOL_VERSION} (2) instead of a literal 1 and passes; bun test + fledge verify green; no module AC beyond REQ-discord-073

## No-spec Rationale

Test-only: the /status fixture asserts the shared protocol constant instead of a literal 1 after the #73 bump; the behavior is specified by REQ-discord-073 in the companion ndjson change
