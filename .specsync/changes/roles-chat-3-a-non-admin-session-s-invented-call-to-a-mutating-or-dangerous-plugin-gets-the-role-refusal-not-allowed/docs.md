---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` E.6 "Run time" bullet: a mutating call the model
  makes, including one to a tool it was never offered, is refused with
  `not allowed for your role` and nothing runs; the refusal is not posted on
  its own and the reply ends with a short `(not allowed for your role)` line;
  a name that is not a plugin keeps the "not offered" refusal. On main the
  bullet claimed the role refusal for every mutating call, which was false for
  invented ones.
- `specs/agent/agent.spec.md`: Invariants line and an Error Cases row for the
  role refusal and note; the new behavior scenario.
- `specs/agent/requirements.md` / `specs/agent/testing.md`: REQ-agent-333 and
  its evidence.
- No CHANGELOG version section, STATUS or package bump (bug-fix slice).
