---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: tasks
---

# Tasks

- [x] Regression tests: `tests/discord.thread-deny.test.ts` (18; 10 fail on the base), `discord-send-file` deny case (fails on the base), `isChannelDenied` unit test (the export is missing on the base).
- [x] `src/allowlist/discord.ts`: `isChannelDenied`, reused by `checkChannel`.
- [x] `src/discord/permissions.ts`: `isMonitoredConversation` (deny on either id wins).
- [x] `src/discord/message-router.ts`: own-channel gate and press gate use it.
- [x] `src/discord/bridge.ts`: restart-recovery `mayPost` uses it.
- [x] `plugins/discord/send-file.ts`: a deny-listed conversation thread is refused before the parent gate.
- [x] Specs: discord files / Public API / Invariants / Error Cases / testing; plugins Public API / testing; deltas REQ-discord-212, REQ-discord-311, REQ-discord-476, REQ-plugins-005 (Modified).
- [x] Docs: `docs/discord.md` (deny behavior, `discord-send-file` gates).
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
