---
module: discord
artifact: testing
---

# testing

See discord.spec.md, docs/DISCORD-GO-LIVE.md, and SpecSync change artifacts for HEAR #5.

- DISCORD-3: thinking-status builders + bridge progress edit sequence (no live token).

## Slash commands (DISCORD-4)

- `tests/discord.slash.test.ts` covers command bodies, dispatch gates, and
  session/status/agents/work handlers with fixture interactions (no live token).

