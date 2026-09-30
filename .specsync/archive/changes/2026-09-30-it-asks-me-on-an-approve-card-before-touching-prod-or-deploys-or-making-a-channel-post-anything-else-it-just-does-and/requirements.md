---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: requirements
---

# Requirements

- Added **REQ-plugins-097** (delta `deltas/plugins.md`): the must-ask gate in
  `runPlugin` — classes from code only, the card kinds and classes, waiting,
  SAFE-20 outcomes (deny, lapse, abort, re-sent deny, worker, no owner), the
  classified builtins and their classifiers, the self-update exemption, and
  that every other builtin has no class.
- Added **REQ-discord-097** (delta `deltas/discord.md`):
  `mustAskApprovalKinds` (`mustask` destructive, `mustask-post` plain) on the
  bridge's engine, and `discord-post-message` raising the post card with the
  exact text after its own checks, before the DISCORD-8 lookup.
- Added **REQ-agent-097** (delta `deltas/agent.md`): the one AUTONOMY-11
  sentence in `ASK_AGENT_SYSTEM_INSTRUCTIONS`.
- Added **REQ-cli-097** (delta `deltas/cli.md`): `task run` streams the gate's
  notes as Text events; `plugins run` prints them on stderr.
- HI: AUTONOMY-9, AUTONOMY-10, AUTONOMY-11 (captured on main, Leif's
  2026-09-28 interview); AUTONOMY-9.a and AUTONOMY-10.a captured with `hi` in
  this change (round 13, 2026-09-30). SAFE-18..20 (the card engine) unchanged.
  AUTONOMY-10 / 10.a's first-20 public-thread replies are the later
  must-ask-public change. No acceptance criteria beyond the captured text;
  open design points are in `design.md` for Leif.
