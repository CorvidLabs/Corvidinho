---
id: req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no
state: implementing
type: bug_fix
base_commit: 80ed1996639f4947d4f709d4410cc49a1474a95f
---

# REQ-agent-112 after the Fledge core builtins: an allowlist with no fledge-* entry and a non-ADMIN role session offer no Fledge plugin command and never spawn fledge; the only fledge- tools they offer are the read-only core builtins fledge-lanes-list and fledge-lanes-validate (PLUGIN-1, PLUGIN-3, ROLES-CHAT-2)

## Intent

REQ-agent-112 after the Fledge core builtins: an allowlist with no fledge-* entry and a non-ADMIN role session offer no Fledge plugin command and never spawn fledge; the only fledge- tools they offer are the read-only core builtins fledge-lanes-list and fledge-lanes-validate (PLUGIN-1, PLUGIN-3, ROLES-CHAT-2)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- tests/agent.allowlisted-dangerous.test.ts: with the Fledge core builtins registered (PLUGIN-1), a code-tier run whose allowlist names only github-pr-review, and a non-ADMIN role session with fledge-hello allowlisted, offer exactly the read-only core builtins fledge-lanes-list and fledge-lanes-validate as fledge- tools, offer and register no Fledge plugin command (fledge-hello), and start no fledge process (the fake fledge records no call). The owner's ADMIN role session still discovers and offers fledge-hello. REQ-agent-112 reads as one requirement again (the merge of #261 and #262 left a duplicated sentence), and its acceptance criteria say the same. No source change.

## No-spec Rationale

Not applicable
