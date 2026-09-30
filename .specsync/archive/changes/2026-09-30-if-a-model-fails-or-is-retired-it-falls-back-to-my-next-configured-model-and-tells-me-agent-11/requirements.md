---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: requirements
---

# Requirements

- AGENT-11 (captured, `hi/agent.md`, Leif 2026-09-28 round 2): "If a model
  fails or is retired, it falls back to my next configured model and tells
  me." Nothing new captured with `hi` in this change.
- Design decisions applied (m34 conservative defaults and round 4): no retries
  or backoff; never fail over on a spend-cap stop, a Deny or a card lapse; no
  persistence across `task run` processes; in a run not the owner's the owner
  learns of a failover from the reply note and an `llm.fallback` warn line,
  no DM.
- Kept: AGENT-13 / AGENT-10 (REQ-agent-179: no default, the no-provider
  notice for an unusable head), SAFE-8 / AUTONOMY-8 (a cap stop asks),
  DISCORD-15.a / SAFE-14.a (tokens and cost owner-only), SAFE-16 (unknown
  price is unknown), SAFE-6 (scrub; reasons never carry provider output),
  ROLES-CHAT-3 (role note last), REQ-agent-428 (image retry first).
- Added: REQ-agent-080, REQ-cli-080, REQ-discord-080, REQ-watch-080,
  REQ-plugins-080.
- Modified: REQ-agent-179, REQ-agent-007, REQ-agent-079, REQ-discord-457.
- No new env var, config key, flag, slash command, NDJSON protocol version or
  schema version; new optional result / usage-frame fields only.
