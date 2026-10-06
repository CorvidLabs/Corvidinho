---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: docs
---

# Docs

- `docs/discord.md`: the Approve / Deny cards list names the hi capture card;
  a new section "Drafted hi criteria wait for your card" (who can draft, what
  a draft must be, the run stops and asks, the card, Approve, delivery, the
  local CLI); the live-source paragraph and the `/work` PR gate row say only
  what approved captures made passes; the code map names `hi-card.ts`,
  `hi-drafts.ts` and `hi-capture-store.ts`.
- `docs/DISCORD-GO-LIVE.md`: the file-tools paragraph says criteria change
  only through a capture the owner approves on the hi card.
- Specs: `agent.spec.md` (files list, Public API, the hi guard paragraph, a
  hi drafts paragraph, two scenarios), `discord.spec.md` (files list, the
  `hi-changed` line, the `hi` kind and the engine's `prepare` step),
  `plugins.spec.md` (the refusal), each module's `testing.md`.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
