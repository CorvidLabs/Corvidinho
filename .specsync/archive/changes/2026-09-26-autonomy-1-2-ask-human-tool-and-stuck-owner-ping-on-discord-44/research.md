---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: research
---

# Research

- Ancestor provenance (issue #44 / #40): corvid-agent
  `owner-question-manager.ts` and MCP `ask_owner` / `notify` handlers. The
  shape "agent asks, question goes to the owner" is kept; the queue, DB
  tables and notification channel are not stolen (not captured).
- Current code: `runToolLoop` returned a plain summary for any final text and
  `runTask` mapped it to `done`; the bridge replied `failed (exit N)` on
  non-zero exits; the live gateway sent replies with discord.js default
  mentions.
- discord.js `allowedMentions: {parse: [], users, repliedUser: true}` limits
  pings to the listed users plus the replied-to author, so model text cannot
  mass-ping.
- The NDJSON parser drops frames with an unknown StateChanged value without
  misparsing, so adding `blocked` is safe without a protocol bump.
