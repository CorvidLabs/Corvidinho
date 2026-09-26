---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: `files:` adds `src/discord/allowed-mentions.ts`
  and `tests/discord.allowed-mentions.test.ts`; Public API names
  `outboundAllowedMentions` / `defangMassMentions` and
  `LiveGatewayOptions.discord`; Invariants add the outbound mention rule
  (REQ-discord-205).
- `specs/discord/testing.md`: REQ-discord-205 test line.
- `docs/discord.md`: "Outbound formats" says every post parses no mentions
  from its text; the ask section keeps the owner-only ping.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
