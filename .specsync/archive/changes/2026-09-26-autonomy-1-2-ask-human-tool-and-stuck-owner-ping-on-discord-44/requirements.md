---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: requirements
---

# Requirements

Captured HI met:

- **AUTONOMY-1** (hi/autonomy.md): when a task cannot proceed without a human
  choice, the agent asks a clarifying question in Discord instead of
  inventing criteria or claiming done: `ask-human` tool, state `blocked`,
  question reply on Discord.
- **AUTONOMY-2**: when stuck, it pings the configured owner on Discord rather
  than dying silently: owner mention on ask replies and schedule posts;
  verify exhaustion becomes a stuck ask.
- **AUTONOMY-3**: Linux headless runner unchanged; asks support it.
- Supporting: **IDENTITY-1/3** (owner record; empty means no ping),
  **AGENT-4** (verify exhaustion still says failed), **AGENT-8** (`blocked`
  state is visible), **DISCORD-2** (reply to the question continues the
  session), **DISCORD-5 / DISCORD-8** (posts only where the bridge already
  posts), **SAFE-6** (question scrubbed before posting).

New canonical requirements (see deltas): **REQ-agent-044**,
**REQ-discord-044**.

Left for HI capture (not built): owner DM path / Approve-Deny cards (#42,
#96), escalation to the owner only "if still stuck", question history in
MEMORY (draft AUTONOMY-3 in docs/hi-drafts/AUTONOMY.md), must-ask list (#97),
loop-guard / CI-fix-limit asks (#86 / #94).
