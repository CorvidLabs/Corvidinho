---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: context
---

# Context

Defect (found while reviewing PR #221, pre-existing on main `cf8c676`): the
Discord bridge's ask button handler (`onComponent` in
`src/discord/bridge.ts`, the DISCORD-ASK "pick" path) ran `agent.runChat`
for the session owner after only the channel gate (REQ-discord-212). It never
called `gateActor` (REQ-discord-201) or `gateRateOrMute` (DISCORD-6 /
REQ-discord-010). Chat (`routeMessage`) and slash
(`handleSlashInteraction`) both run channel → actor → mute/rate first.

Repro on main (bridge, dry run, fake gateway, injected agent that always asks
with buttons): user A @mentions and gets a Choose stub. The owner mutes A (or
A is added to `denyUsers`). A presses a choice and the agent runs a turn
anyway (prompts 1 → 2). That turn asks again with buttons, so A can keep a
session going by buttons alone while muted or deny-listed. The "open" button
also showed the choices to a muted or deny-listed user.

Constraints: existing HI only (DISCORD-6, ALLOW-5, DISCORD-DENY-3,
ROLES-CHAT-1, IDENTITY-1/2); no new command, env var, table or column. A press
needs an interaction ack, so every refusal is ephemeral. The pending ask must
not be cleared on a refusal, so the owner can still answer it once allowed.
PR #221 (open, DISCORD-6 rate limit by level) also modifies REQ-discord-010;
this change keeps REQ-discord-010's existing text and only adds to it.
