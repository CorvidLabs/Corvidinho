---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: tasks
---

# Tasks

- [x] Capture AUTONOMY-10.b with `hi` from Leif's 2026-09-28 interview (round 16); `hi check` passes.
- [x] Confirm on main that the bridge-live note posts with no card and no model text (no gate on its path; fixed template, validated version only).
- [x] `tests/discord.update-post.test.ts`: AUTONOMY-10.b block (4 tests) and the helper's optional db / agent / public-thread / DM recording.
- [x] Comments citing AUTONOMY-10.b in `src/discord/announce.ts` and `src/discord/bridge.ts`.
- [x] `docs/discord.md` must-ask list and `docs/DISCORD-GO-LIVE.md` must-ask bullet cite AUTONOMY-10.b.
- [x] Spec prose (`discord.spec.md`), Modified REQ-discord-024 delta, `specs/discord/testing.md` evidence.
- [x] Fail-on-base proof and mutation check recorded in testing.md.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
