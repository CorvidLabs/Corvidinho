---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: plan
---

# Plan

1. `hi AUTONOMY-10.b "<Leif's text>"` (own commit); `hi check`.
2. `specsync change new` for the `discord` module; answer the interview.
3. Tests in `tests/discord.update-post.test.ts` (AUTONOMY-10.b block).
4. Comments in `src/discord/announce.ts` and `src/discord/bridge.ts`.
5. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose,
   Modified REQ-discord-024 delta, module testing evidence.
6. Fail-on-base proof (swap main e1a24ed's `docs/discord.md`,
   `docs/DISCORD-GO-LIVE.md`, `hi/autonomy.md`, `INTENT.md`,
   `announce.ts`, `bridge.ts` in, run, restore, run) and a mutation check
   (route the note through the reply gate; the bridge cases fail).
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
