---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: plan
---

# Plan

1. Regression tests in `tests/discord.requester-perms.test.ts` (fixture
   checker via `setRequesterPermCheckerForTests`, a `fetch` spy for "nothing
   posted", one real discord.js `login` stubbed to fail); confirm the new
   acting-user cases fail on `main`'s `plugins/discord/index.ts`.
2. Handler change in `plugins/discord/index.ts` (acting user read, mismatch
   refusal, check for the acting user, fail-closed catch with
   `formatErrorLine`).
3. Delta modifies REQ-discord-012; canonical `specs/discord/requirements.md`,
   the discord spec invariant + error row, and `specs/discord/testing.md`.
4. Docs: `docs/discord.md` (new "Posts to another channel (DISCORD-8)"),
   `docs/DISCORD-GO-LIVE.md` (Server Members Intent line, allowlist table row),
   `.env.example` strict-mode comment.
5. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
