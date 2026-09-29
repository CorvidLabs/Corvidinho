---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: docs
---

# Docs

- `docs/discord.md` "Thinking progress embeds": live `~tok` on the owner's
  runs only; new "Answer footer (DISCORD-15 / 15.a)" paragraph (format,
  owner-only tokens and cost, unknown never $0, time, re-edit keeps it,
  fallback reply carries it, delegate workers not counted). "Live source": the
  answer shows the whole 4000-character summary, split; WATCH keeps 1800.
  "Session replies": new "Long answers (DISCORD-16)" paragraph (split rules,
  fence handling, role note, scrub, embed only for long plain prose, pings,
  reply continuity, 6000 cap, surfaces, WATCH / schedule caps). Limits table:
  answers split at 2000, gateway / slash cap 2000, ask posts and
  `discord-post-message` 1900, one-embed prose up to 4096. Source map lists
  `src/discord/rich-reply.ts`.
- `specs/discord/discord.spec.md` prose and `files:`, `specs/discord/testing.md`,
  `specs/agent/agent.spec.md` (`collectTaskRunStream` `usage` / `bodyMax`,
  `chatBodyFromTaskResult` `max`).
- `docs/DISCORD-GO-LIVE.md` and `README.md` state nothing this changes. No
  operator knob, env var, slash command or CLI flag.
