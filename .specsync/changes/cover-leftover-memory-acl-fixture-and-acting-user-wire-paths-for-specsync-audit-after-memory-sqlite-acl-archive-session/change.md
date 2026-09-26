---
id: cover-leftover-memory-acl-fixture-and-acting-user-wire-paths-for-specsync-audit-after-memory-sqlite-acl-archive-session
state: implementing
type: bug_fix
base_commit: e5a926e64ece9bd428c718f0872de7a6c58ba617
---

# Cover leftover MEMORY ACL fixture and acting-user wire paths for SpecSync audit after memory-sqlite-acl archive (session/work handlers, slash-types, scheduler actingUser, memory tests, version 0.0.4 fixtures)

## Intent

cover leftover MEMORY ACL fixture and acting-user wire paths for SpecSync audit after memory-sqlite-acl archive (session/work handlers, slash-types, scheduler actingUser, memory tests, version 0.0.4 fixtures)

## Affected Canonical Specs

- `discord`
- `plugins`
- `cli`

## Acceptance Criteria

- SpecSync change audit covers leftover MEMORY ship paths (session/work handlers, slash-types, scheduler actingUser env, memory*.test.ts, version/update-helpers 0.0.4 fixtures); no new HI; fledge verify green

## No-spec Rationale

Cover leftover MEMORY #41/#59 ship paths for SpecSync change audit after archive tip; no module AC change beyond REQ-discord-021 / REQ-plugins-010 / REQ-cli-011 already archived
