---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: context
---

# Context

The Discord bridge end-to-end audit on origin/main 543d580 (v0.0.25) found
three DISCORD-6 defects. I re-checked each on 3cdbb5c (current main) with a
throwaway `startBridge` fixture (fake gateway, echo agent, in-memory DB).
All three still reproduced:

- **Defect 6: `DISCORD_RATE_LIMIT_BY_LEVEL` had no effect.** With
  `DISCORD_RATE_LIMIT_MAX=3` and `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}`,
  the owner's 4th `/status` got "Slow down!". The bridge called
  `routeMessage` with `rateLimit: { state, config }` and no `permLevel`,
  and never set `SlashContext.permLevelFor`, so `checkRateLimit` always used
  the default max.
- **Defect 8: the owner could mute themselves.** Owner `/mute user:<owner>`
  replied "Muted …". The next `/unmute user:<owner>` was refused with
  "You do not have permission…", because the mute gate runs before the
  handler and a muted owner is not ADMIN (REQ-discord-012). Mutes live in
  memory, so only a restart recovered.
  `command-handlers/mute.ts` had no check for the invoker or the owner.
- **Defect 11: muted and rate-limited users got a public reply on every
  message.** Five @mentions from a muted user produced five public "You do
  not have permission…" posts. A spammer made the bot post once per spam
  message, which works against DISCORD-6.

HI: DISCORD-6 (rate limits and mutes stop one user from melting the box
without punishing everyone else), IDENTITY-2 (only the configured owner may
use admin slash), and DISCORD-DENY-2 (MessageCreate has no ephemeral; slash
denials are ephemeral). REQ-discord-010 is the owning requirement.

Constraints: no new env var, slash command, table or column; no package bump.
Channel-deny and actor-deny paths are unchanged (still silent on
MessageCreate). Slash refusals keep their ephemeral reply on every call,
because Discord requires an ack within 3 s.

Out of scope, and left to their own changes: the other audit defects (1–5, 7,
9, 10) and the doc drift in the slash gate-order line.
