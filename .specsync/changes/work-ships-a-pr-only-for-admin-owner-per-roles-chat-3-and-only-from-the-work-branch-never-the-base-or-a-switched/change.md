---
id: work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched
state: draft
type: bug_fix
base_commit: 155f20af4346b11c10cdbe68526314962a1e09a2
---

# /work ships a PR only for ADMIN (owner) per ROLES-CHAT-3, and only from the work branch (never the base or a switched/detached HEAD)

## Intent

/work ships a PR only for ADMIN (owner) per ROLES-CHAT-3, and only from the work branch (never the base or a switched/detached HEAD)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- non-owner /work never runs the PR step; push refused unless HEAD is the work branch and not the base

## No-spec Rationale

Not applicable
