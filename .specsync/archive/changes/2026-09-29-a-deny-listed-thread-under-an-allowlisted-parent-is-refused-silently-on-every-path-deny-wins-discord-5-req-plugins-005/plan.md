---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: plan
---

# Plan

1. Regression tests (fail on the base): `tests/discord.thread-deny.test.ts`
   (router, press gate, bridge chat / thread / button, slash + schedule locks,
   restart recovery), a `discord-send-file` case in
   `tests/discord.send-file.test.ts`, an `isChannelDenied` unit test in
   `tests/allowlist.default-deny.test.ts`.
2. `isChannelDenied` + `isMonitoredConversation`; use them in the router,
   the press gate, restart recovery and `discord-send-file`.
3. Specs: discord files / Public API / Invariants / Error Cases / testing;
   plugins Public API / testing; deltas REQ-discord-212, REQ-discord-311,
   REQ-discord-476, REQ-plugins-005 (Modified). `docs/discord.md`.
4. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
