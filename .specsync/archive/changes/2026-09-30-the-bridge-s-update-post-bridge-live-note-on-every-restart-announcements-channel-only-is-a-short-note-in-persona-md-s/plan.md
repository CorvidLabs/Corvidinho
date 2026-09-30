---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: plan
---

# Plan

1. Capture PERSONA-1.a with `hi` in its own commit; `hi check`.
2. Write `tests/discord.update-post.test.ts` (bridge ClientReady post through
   `startBridge` with a recorded reply, template units, odd versions) and
   watch it fail with main's `src/discord/announce.ts`.
3. Replace the bullet builder in `src/discord/announce.ts` with the fixed
   in-voice template and release link; drop the CHANGELOG / package
   description readers; comments in `src/discord/bridge.ts`.
4. Drop the CHANGELOG-bullet tests from `tests/discord.announce.test.ts`.
5. Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md` (E.8), `README.md`
   (Persona); spec prose, `files:` and `specs/discord/testing.md`; delta
   (Modified REQ-discord-024 / REQ-discord-025).
6. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
