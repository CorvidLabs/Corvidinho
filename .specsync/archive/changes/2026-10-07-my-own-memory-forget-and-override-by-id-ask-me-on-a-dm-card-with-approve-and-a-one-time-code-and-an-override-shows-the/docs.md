---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: docs
---

# Docs

- `docs/discord.md`: the Memory paragraph describes the `memory` card (action,
  target, amount, the override's text first, Approve + code, 5 min, changed
  since ⇒ nothing, Deny / lapse / stop ⇒ nothing, audit, bridge-only, no
  token fallback); the forget-me paragraph's last line and the Approve / Deny
  cards intro name it; the session-thread paragraph drops the confirm-token
  sentence; the file map lists `memoryApprovalKind` and `src/memory/card.ts`.
- `docs/DISCORD-GO-LIVE.md`: the `memory-forget` / `memory-override`
  allowlist rows describe the card and that `plugins run` on the box refuses.
- Specs: `specs/plugins/plugins.spec.md` (memory paragraph; files list drops
  `src/memory/confirm.ts` and `tests/memory.confirm.test.ts`, gains
  `tests/memory.forget-card.test.ts`), `specs/discord/discord.spec.md` (files
  list gains `src/memory/card.ts`; Public API lists `memoryApprovalKind` and
  `src/memory/card.ts`; behaviour line); module `testing.md` evidence in
  plugins, discord and agent.
- `hi/safe.md` / `INTENT.md`: SAFE-18.a captured with `hi` (own commit).
- No README, CHANGELOG, STATUS or package.json edit (STATUS's #128 row is
  history).
