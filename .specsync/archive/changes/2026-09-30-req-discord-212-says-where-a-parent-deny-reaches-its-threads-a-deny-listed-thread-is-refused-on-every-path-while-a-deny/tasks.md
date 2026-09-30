---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: tasks
---

# Tasks

- [x] Verify the investigation on main 7697caf: `checkChannel` / `isMonitoredConversation` gates, every caller (router, ask buttons, slash dispatch, `/schedule create`, `gateTick`, restart recovery, `discord-send-file`, `discord-post-message`, forget-card fallback), and where the parent is recorded (message path, button pick, `/session start` / `/work`).
- [x] `tests/discord.thread-deny.test.ts`: B and C cases (message refused, also in a talk started before the deny; ask press for a message-started session refused, also through `startBridge`; slash, `/schedule create` + tick, `discord-post-message`, `/session start` ask press and its no-parent restart row served on the thread's own id; a reply in the thread to a `/session start` answer carries the parent); `discord-post-message` added to the A refusals; helpers moved to module scope and reused.
- [x] Delta `deltas/discord.md`: Modified REQ-discord-212, REQ-discord-311, REQ-discord-476 (full text, narrowed wording, new acceptance bullets).
- [x] `specs/discord/discord.spec.md`: `isMonitoredConversation` caller list, send-file invariant, MessageCreate invariant parenthetical, two Error Cases rows; three stale duplicate invariant lines removed (each an older subset of the line kept).
- [x] `specs/discord/testing.md` and `docs/discord.md` ("Deny always wins", send-file channel and gate bullets).
- [x] No change under `src/` or `plugins/`; no `hi/` capture.
- [x] `specsync change check --commit`, `specsync change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
