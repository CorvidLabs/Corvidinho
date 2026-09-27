---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: requirements
---

# Requirements

- ROLES-CHAT-3 (captured in `hi/roles.md`), quoted in `context.md`. Also
  consistent with ROLES-CHAT-2 (catalog), ROLES-CHAT-5 (what counts as
  mutating: `isMutatingPlugin`) and ROLES-CHAT-6 (role re-checked each call).
- Add REQ-agent-333 (delta `deltas/agent.md`): in a non-ADMIN role session
  the tool loop answers a not-offered registered mutating/dangerous plugin with
  the role refusal `runPlugin` gives; once a call in the run is refused for
  the role, every summary of that run ends with `(not allowed for your role)`,
  once.
- REQ-agent-128 is unchanged: no not-offered name is ever run, and every
  not-offered name that is not a mutating plugin in a non-ADMIN session keeps
  the catalog refusal.
- No new env var, config key, flag, slash command, schema or package version.
