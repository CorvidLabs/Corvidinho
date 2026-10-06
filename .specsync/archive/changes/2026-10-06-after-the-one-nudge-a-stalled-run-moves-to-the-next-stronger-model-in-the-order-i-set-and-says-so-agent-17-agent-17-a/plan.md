---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: plan
---

# Plan

1. Capture AGENT-17.a with `hi AGENT-17.a "…"` (hi/agent.md, INTENT.md
   index), `hi check`, one commit.
2. `providers.ts`: order key, `strongerModel` / `moveToStronger`, closing
   note helpers.
3. `loop-guards.ts`: guard `escalate` step, operator lines.
4. `execute.ts`: `ModelCalls.escalate`, the stall branch move, summary note.
5. `task-summary.ts`: keep the note through clips.
6. Docs: `--help`, `.env.example`, README, docs/discord.md,
   docs/DISCORD-GO-LIVE.md (E.9 + env block); preload unsets the key.
7. Tests: `tests/agent.stall-escalate.test.ts` (units, loop, spend, worker
   env, CLI), stall-nudge updates, preload probe and help assertions; prove
   fail on base by swapping base sources in, then restore.
8. Specs (agent, cli) prose, deltas (REQ-agent-088 added; REQ-agent-087,
   REQ-cli-009, REQ-cli-262 modified), testing companions.
9. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc
   --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
