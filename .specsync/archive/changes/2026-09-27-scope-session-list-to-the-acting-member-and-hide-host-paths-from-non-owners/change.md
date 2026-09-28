---
id: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
state: archived
type: bug_fix
base_commit: 3cdbb5c7cc469fe3d9fbaae991f58d69326da9dd
---

# Scope /session list to the acting member and hide host paths from non-owners

## Intent

Scope /session list to the acting member and hide host paths from non-owners

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A non-ADMIN member's /session list shows only sessions whose owner user id matches the acting user (SESSION-MULTI-1); no other user's session id, mention or topic; project shown as name, never an absolute host path. The owner (ADMIN, IDENTITY-2) keeps the full list with every session and its full project path. No owner configured means nobody is ADMIN, so everyone sees only their own (IDENTITY-3). /schedule list shows a member the project name only; /status stays counts-only. Regression tests fail on main and pass after.

## No-spec Rationale

Not applicable
