---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: requirements
---

# Requirements

- Added **REQ-discord-101** (delta `deltas/discord.md`): memory scopes
  (`person:<id>`, `project:<key>`, Discord id), recall without private notes,
  the chat / button-pick / `/work` inject by subject and role, schema v12
  `forget_requests`, the owner's DM Approve/Deny card (reusable helper), the
  delivery pass (tick hook, after chat), press handling (owner only, late =
  no, SAFE-5 fail closed, one transaction), telling both (MEMORY-5..7,
  MEMORY-ACL-6).
- Modified **REQ-discord-021**: scope may be a person or project scope; the
  profile and private categories; the owner-approved forget request is the one
  other forget path.
- Added **REQ-plugins-101** (delta `deltas/plugins.md`): subject from the
  people list, profile categories, `memory-profile`, owner-only `--person`
  with the opaque refusal, private notes by name in a conversation,
  `--project` for owner / team / local, `memory-forget-me` (audited, deletes
  nothing).
- Modified **REQ-plugins-010**: the two new safe commands; own scope now
  means the person's profile.
- Added **REQ-agent-101** (delta `deltas/agent.md`): the memory prompt rules
  (e)–(h).
- HI: MEMORY-5, MEMORY-6, MEMORY-7, MEMORY-ACL-6 (captured in this PR).
  MEMORY-1..4, MEMORY-ACL-1..5, IDENTITY-1..14, SAFE-4/5/6 unchanged. No
  acceptance criteria beyond the captured text; open design points are in
  `design.md` for Leif.
