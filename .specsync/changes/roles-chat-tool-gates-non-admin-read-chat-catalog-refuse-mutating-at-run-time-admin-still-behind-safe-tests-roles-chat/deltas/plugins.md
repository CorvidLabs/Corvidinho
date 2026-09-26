---
module: plugins
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
---

# Delta — plugins (ROLES-CHAT mutating gates)

## Modified

### SPEC SECTION Invariants

File write/edit are `mutating: true` even when `dangerous: false` (ROLES-CHAT-5).
When `CORVIDINHO_ACTING_IS_ADMIN` is set, non-ADMIN callers are refused for every
mutating plugin at run time with "not allowed for your role" (ROLES-CHAT-3/6);
ADMIN still passes SAFE-1 for dangerous tools. Role is re-checked via owner
config each call.

### SPEC SECTION Behavioral Examples

### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

### SPEC SECTION Error Cases

| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |

### SPEC SECTION Change Log

| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2..6 mutating role gates |

## Added

### REQUIREMENT REQ-plugins-roles-001

Plugin commands MAY declare `mutating: true`. `isMutatingPlugin` SHALL treat
`dangerous: true` OR `mutating: true` as mutating. `files-write` and
`files-edit` SHALL set `mutating: true`.

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` asserts files-write/edit mutating and non-admin refuse.

### REQUIREMENT REQ-plugins-roles-002

When `CORVIDINHO_ACTING_IS_ADMIN` is present in the environment, `runPlugin`
SHALL refuse mutating plugins unless `resolveActingIsAdmin` returns true
(owner re-check). Refusal message SHALL include "not allowed for your role".

Acceptance Criteria
- Non-admin refuses files-write/shell/github-pr-create/memory-forget.
- Admin reaches files-write; shell still SAFE-1 without allowlist.
