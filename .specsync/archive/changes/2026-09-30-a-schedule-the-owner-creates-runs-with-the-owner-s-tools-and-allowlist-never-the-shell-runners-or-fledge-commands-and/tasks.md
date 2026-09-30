---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: tasks
---

# Tasks

- [x] No new `hi` capture: DISCORD-SCHEDULE-1.a is already captured on main (Leif, 2026-09-28 interview); `hi check` passes.
- [x] `src/agent/ask.ts`: `mustAskRefusedAsk` (denied / expired / resent ⇒ stuck ask naming tool, why, rule and card).
- [x] `src/agent/execute.ts`: no Fledge discovery in a scheduled run; a must-ask no ends a scheduled run with that ask and one operator line.
- [x] `src/plugins/roles.ts`: `resolveActingRole` never returns team in a scheduled run.
- [x] `src/scheduler/service.ts`: `SchedulerServiceOpts.loadOwner`, `liveOwner()`, owner stamp only for the live owner's own schedule after `gateTick`; never team.
- [x] `src/discord/bridge.ts` and `src/daemon/daemon.ts` wire `loadOwner`; `src/discord/agent-client.ts` doc.
- [x] Regression tests: 17 in `tests/scheduler.owner-role.test.ts` (new), 3 in `tests/roles.team.test.ts`, 1 in `tests/agent.allowlisted-dangerous.test.ts`.
- [x] Fail-on-base proof: base (af4597e) sources swapped in (the additive `mustAskRefusedAsk` kept so the new file loads): 15 of the 21 new tests fail; restored, all pass.
- [x] Specs: discord, plugins, agent, cli prose and testing notes; deltas REQ-discord-741, REQ-agent-741, REQ-cli-741 (Added), REQ-plugins-065, REQ-discord-713 (Modified).
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`.
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
