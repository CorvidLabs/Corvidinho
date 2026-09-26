---
id: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
state: implementing
type: feature
base_commit: 70ce3bb4a7a557c5cafec7844a08d60f819a9906
---

# ROLES-CHAT tool gates: non-ADMIN read/chat catalog + refuse mutating at run time; ADMIN still behind SAFE; tests ROLES-CHAT-7; bump 0.0.13

## Intent

ROLES-CHAT tool gates: non-ADMIN read/chat catalog + refuse mutating at run time; ADMIN still behind SAFE; tests ROLES-CHAT-7; bump 0.0.13

## Affected Canonical Specs

- `plugins`
- `agent`

## Acceptance Criteria

- Non-ADMIN acting sessions: catalog omits mutating tools; runPlugin refuses files-write/edit/delete, shell-exec, github-pr-create, memory-forget with not-allowed-for-your-role. ADMIN (CORVIDINHO_ACTING_IS_ADMIN=1 + owner re-check) can reach mutating paths still gated by SAFE-1. Channel allowlist still required. Automated tests cover ROLES-CHAT-7 a/b/c. Package 0.0.13 + CHANGELOG.

## No-spec Rationale

Not applicable
