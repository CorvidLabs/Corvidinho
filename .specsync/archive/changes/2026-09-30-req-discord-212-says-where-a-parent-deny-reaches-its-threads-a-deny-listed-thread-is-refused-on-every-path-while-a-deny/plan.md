---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: plan
---

# Plan

1. Verify each claim of the investigation against main 7697caf (gates,
   callers, where the parent is recorded).
2. Add tests to `tests/discord.thread-deny.test.ts` for B
   (`channels=[T]`, `deny=[P]`) and C (`channels=[P,T]`, `deny=[P]`),
   reusing its helpers, and add `discord-post-message` to the A refusals.
   They pin current behaviour and pass on main.
3. Delta `deltas/discord.md` (## Modified): REQ-discord-212,
   REQ-discord-311, REQ-discord-476 with their full text narrowed.
4. Prose: `specs/discord/discord.spec.md` (caller list, send-file and
   MessageCreate invariants, Error Cases rows; drop three stale duplicate
   invariant lines), `specs/discord/testing.md`, `docs/discord.md`.
5. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
6. Draft PR; no review / finalize / merge in this change.
