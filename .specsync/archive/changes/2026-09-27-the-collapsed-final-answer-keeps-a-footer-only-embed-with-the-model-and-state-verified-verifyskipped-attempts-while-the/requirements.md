---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: requirements
---

# Requirements

DISCORD-3.a (`hi/discord.md`), with DISCORD-ASK-6/7 unchanged. Added
`REQ-discord-457`: the collapsed final answer (@mention/reply, a button pick's
resumed answer, `/session start`, `/work`) keeps one footer-only embed with the
model and the run's plumbing, colored like the fallback's done/error status;
the Choose stub carries none; a re-edit keeps it; the body stays human text.
See `deltas/discord.md`. No new env vars, config keys, slash commands or
schema changes.
