---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: requirements
---

# Requirements

- Added **REQ-agent-071** (delta `deltas/agent.md`): `src/agent/untrusted.ts`
  (name cleaning, look-alike skeleton, fence, detector, notice validation);
  the untrusted-content system paragraph on every task-run system prompt;
  tool-result fence and scan; mutating tools dropped and refused after a hit;
  audit row; `onInjection`; summary note (SAFE-11/12/13).
- Added **REQ-discord-071** (delta `deltas/discord.md`): cleaned names and
  `name_clash` in the acting-user block; non-owner words fenced on chat,
  `/session start`, `/work`; pre-run refusal with owner ping and audit row;
  owner notice for a run's tool-result hit on chat, button pick, slash and
  schedule posts; replay / memory lines hardened.
- Modified **REQ-discord-036**: the "block unchanged" clauses now name the
  SAFE-11 exception (cleaned name, `name_clash` line).
- Added **REQ-watch-071** (delta `deltas/watch.md`): fenced title / body
  within the prompt cap; pre-run verdict, refusal comment @mentioning the
  owner, audit row; summary owner line for a run's tool-result hit.
- Modified **REQ-watch-036**: the "prompt exactly as before" clause now names
  the SAFE-12 fence.
- Added **REQ-plugins-071** (delta `deltas/plugins.md`):
  `discord-user-lookup` names cleaned; `web-fetch` on the shared fence; the
  role gate is the only permission source.
- Added **REQ-cli-071** (delta `deltas/cli.md`): `TaskResult.injection` on the
  `task run` result.
- HI: SAFE-11, SAFE-12, SAFE-13 (captured on main with #270, from Leif's
  2026-09-28 interview, round 4). IDENTITY-1..14, ROLES-CHAT-*, SAFE-1..9 and
  the rest unchanged. No acceptance criteria beyond the captured text; open
  design points are listed in `design.md` for Leif.
