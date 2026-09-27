---
change: req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no
artifact: testing
---

# Testing

`tests/agent.allowlisted-dangerous.test.ts`, describe "Fledge commands
through the allowlist (PLUGIN-3 / FLEDGE-4, REQ-agent-112)":

- "an allowlist with no fledge-* entry never spawns fledge": the offered
  `fledge-` tools are exactly `fledge-lanes-list` and `fledge-lanes-validate`;
  `fledge-hello` is neither offered nor registered; the fake fledge writes no
  `calls.log`, `other.log` or `runs.log`.
- "a non-ADMIN role session with fledge-hello allowlisted never spawns fledge
  (ROLES-CHAT-2)": the same offered set, `fledge-hello` neither offered nor
  registered, no `calls.log`.
- The ADMIN role session and allowlisted `fledge-hello` tests are unchanged.

Before the fix, on the merge of main into this branch: 15 pass, 2 fail in the
file (both failures were the `fledge-` prefix assertion). After: the file
passes in full.
