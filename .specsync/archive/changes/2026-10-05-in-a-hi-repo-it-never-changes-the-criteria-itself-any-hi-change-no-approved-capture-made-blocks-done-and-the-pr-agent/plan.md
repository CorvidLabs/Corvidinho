---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: plan
---

# Plan

1. No `hi` capture (AGENT-18 / AGENT-18.a are on main); `hi check`.
2. `src/agent/repo-ways.ts`: parse, diff, snapshot, note; ledger `hiStart`;
   prompt block text.
3. `src/agent/loop.ts`: `hiGateNote` in the gate set beside `sddGateNote`.
4. `src/work/pr.ts`: `hi-changed` before the fallback re-verify, commit and
   push.
5. `plugins/files`: `isHiPath`, `hiRefuseMessage`, `refuseHi` in write, edit
   and delete.
6. `tests/agent.hi-guard.test.ts`; fail-on-base proof (swap b84c75f's four
   modified sources in with the new repo-ways.ts kept, run, restore, run).
7. Docs (docs/discord.md, docs/DISCORD-GO-LIVE.md), spec prose, deltas,
   module testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
