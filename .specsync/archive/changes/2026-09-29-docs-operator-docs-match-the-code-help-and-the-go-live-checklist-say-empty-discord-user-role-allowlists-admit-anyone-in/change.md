---
id: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
state: archived
type: documentation
base_commit: 310861f81c5fb0314447109b959b8f37fb323578
---

# Docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), and docs/DAEMON.md lists daemon.start_failed and spend.warning

## Intent

docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), and docs/DAEMON.md lists daemon.start_failed and spend.warning

## Affected Canonical Specs

- `cli`
- `discord`

## Acceptance Criteria

- corvidinho --help and the go-live checklist that doctor and discord bridge print say an empty channel list refuses start, users and roles both empty admit anyone in an allowlisted channel, and once either is set only those users, role holders and the owner (REQ-discord-043); neither says empty user/role lists are deny-all, and tests/docs.operator-facts.test.ts checks both surfaces alongside the operator docs. docs/DAEMON.md's Logs table has a row for every event src/daemon/daemon.ts logs, including daemon.start_failed (start refused, exit 1, message gives the reason) and spend.warning (warn, amounts and percent). The new checks fail on the base and pass on the branch.

## No-spec Rationale

Not applicable
