---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: research
---

# Research

- Sources: issue #122 (body and comments), Leif's interview record
  `/home/user/coord/interview-2026-09-28.md` (round 15, 2026-09-30), and the
  build brief for this slice.
- Every Discord surface reaches a run through `createSpawnAgentClient`
  (`task run --output ndjson`) and ends in one of five failure lines: the
  chat and ask-resume bodies in `bridge.ts`, `/session start`, `/work`
  and the schedule post. The thrown-run paths (`❌ <err.message>`) are in
  the same four handlers.
- The failed result's summary is not usable as the reason: on a provider
  failure it is `LLM HTTP <status>: <body>` (the provider's text), after a
  verify failure it is the model's prose plus the lane output (SAFE-12/13,
  AGENT-9). The chain's `ModelFailure` (kind + status) and the failing
  entry's `baseUrl` are harness facts, so the reason is built from them.
- Owner checks already in use: `isOwnerDiscord(config.owner, userId)` for the
  DISCORD-15.a footer on every surface, and `byOwner` in the scheduler
  (DISCORD-SCHEDULE-1.a). The owner DM path: the gateway `sendDm` behind
  `sendDmRef`, as `createSpendDm` uses it (SAFE-14.a, #316/#317).
- `scrubSecrets` (SAFE-6) and `defangMassMentions` are the existing scrub and
  mention guards; `providerNotice(env, [tier])` is the AGENT-10 notice.
