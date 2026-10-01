---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: plan
---

# Plan

1. No `hi` capture: AUTONOMY-10 and AUTONOMY-10.a are on main; `hi check`.
2. `src/discord/public-reply-gate.ts` (count, lookup, hold, card kind, stamp
   constant, test seams).
3. Gateway `isPublicThread`; `ThinkingStatus.hold`; spawn stamp.
4. Bridge: register the kind; hold chat, ask-pick and thin-ack posts; the
   scheduler poster; `close()` on stop; the gate in the slash context.
5. `holdSlashReply` in slash-finish; `/session start` and `/work` set the
   pending ask and record the turn only after the hold.
6. Scheduler `modelText`; `discord-send-file` `mustAsk`; the boundary test.
7. Tests: `tests/discord.public-reply-gate.test.ts`; fail-on-base proof by
   swapping the base's ten modified source files in (the new module kept).
8. Docs, spec prose, deltas, testing evidence.
9. `specsync change approve` → `change check --commit` → `change audit` →
   `specsync check --require-coverage 100` → `hi check` → `bunx tsc
   --noEmit` → `bun test` → `fledge lanes run verify --non-interactive`.
