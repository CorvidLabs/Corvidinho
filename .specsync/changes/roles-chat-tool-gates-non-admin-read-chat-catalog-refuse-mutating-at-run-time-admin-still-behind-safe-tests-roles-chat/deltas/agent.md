---
module: agent
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
---

# Delta — agent (ROLES-CHAT catalog filter)

## Modified

### SPEC SECTION Invariants

`buildOpenAiTools` omits mutating plugins when `actingIsAdmin` is false
(ROLES-CHAT-2); `createTaskExecute` resolves ADMIN from env via
`resolveActingIsAdmin` when a role session is active.

### SPEC SECTION Change Log

| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2 catalog omit mutating for non-ADMIN |

## Added

### REQUIREMENT REQ-agent-roles-001

When building the tool catalog for an acting session, non-ADMIN SHALL not
receive mutating tools (including files-write/edit).

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` catalog assertions for non-admin vs admin.
