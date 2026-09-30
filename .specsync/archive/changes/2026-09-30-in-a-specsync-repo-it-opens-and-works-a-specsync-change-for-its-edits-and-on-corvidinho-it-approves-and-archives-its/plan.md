---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: plan
---

# Plan

1. Capture AGENT-18.a with `hi` (first commit).
2. `src/agent/repo-ways.ts`: detection, policy, coverage, ways line, prompt
   block, run ledger, Corvidinho identity, lifecycle gate and settle step,
   hi citations.
3. `plugins/specsync/commands.ts` (+ `api.ts` PATH lookup): status / new /
   answer / approve / finalize; `PluginCommand.agentTool` and the catalog
   skip; `TEAM_WORK_TOOLS`; `STATE_CHANGING_TOOLS`; tool-surface budget.
4. `src/agent/loop.ts`: planning scan and ways line, coverage gate before the
   lane, `runLane`, post-lane settle and re-run; `ExecuteContext.repoWays` and
   the `runToolLoop` prompt block.
5. `src/work/pr.ts`: `sdd-uncovered` before commit and push.
6. Tests: new `tests/agent.repo-ways.test.ts`; `tests/roles.team.test.ts`
   expectations.
7. Fail-on-base proof: swap the base's sources in, run, restore.
8. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose, deltas,
   testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`. No review / finalize here.
