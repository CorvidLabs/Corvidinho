---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: tasks
---

# Tasks

- [x] No new `hi` capture: SAFE-3.a is already captured on main (Leif, 2026-09-28 interview); `hi check` passes.
- [x] `src/agent/shell-gate.ts`: `shellToolsGate`, `isOwnTalkWorktree` (with git's back-pointer), `ACTING_SURFACE_ENV` / `ACTING_SURFACES` / `SAFE3A_SURFACES` / `actingSurface`, `shellToolsRefusedLine`.
- [x] `src/agent/tools.ts`: `SAFE3A_TOOLS` (renamed), `allowlistOffers(…, safe3a)`, `BuildToolsOpts.safe3a`.
- [x] `src/agent/execute.ts`: per-attempt gate in `createTaskExecute`, one operator line per run; `runToolLoop` untouched.
- [x] Surface stamps: Discord spawn client (`surface`, always overwritten), WATCH client (`watch`), bridge chat and ask, `/session start`, `/work`, scheduler `runOne`.
- [x] Regression tests: 8 in `tests/agent.safe3a-gate.test.ts`, 9 in `tests/agent.safe3a-owner-shell.test.ts` (one is the owner-chat prod command raising the must-ask card), 3 in `tests/discord.safe3a-surface.test.ts`; `tests/agent.allowlisted-dangerous.test.ts` uses `SAFE3A_TOOLS`.
- [x] Fail-on-base proof: base sources swapped in, 13 failures (gate file cannot load, 8 of 9 end to end, 3 of 3 stamps, the renamed set); restored, all 39 pass.
- [x] Specs: agent (files, Public API, scenario, error rows, testing), discord (files, stamp prose, testing), watch (spawn prose, testing); deltas REQ-agent-501 / 502 (Modified), REQ-agent-503, REQ-discord-735, REQ-watch-735 (Added).
- [x] Docs: `docs/DISCORD-GO-LIVE.md` (tool rows, E.3 bullet with `CORVIDINHO_LLM_TIER=code`, the internal stamp), `docs/discord.md` (roles bullet, code map), `STATUS.md` (remaining gaps).
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
