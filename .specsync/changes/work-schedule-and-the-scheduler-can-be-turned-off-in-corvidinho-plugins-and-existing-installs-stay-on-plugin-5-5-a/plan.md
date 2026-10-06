---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: plan
---

# Plan

1. No `hi` capture (PLUGIN-5 and PLUGIN-5.a are already on main); `hi check`.
2. Settings reader in `src/autonomous/enabled.ts` (shared scrape, two
   sources, fail closed, change tracker).
3. Slash gate (`slash-dispatch.ts`, `slash-types.ts`), `WorkStore.isWorkSession`.
4. Bridge: `extraState`, start-up log, `/work` talk message and press gates,
   scheduler `schedulesEnabled`.
5. `SchedulerService.schedulesEnabled` (gate only the schedules part of the tick).
6. Daemon wiring, `schedules` field and events.
7. `tests/plugins.extras-toggle.test.ts`; docs gate-order test; fail-on-base
   proof (swap the base's gate sources in with the settings module kept, run,
   restore, run again).
8. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md` E.11,
   `docs/BOX-UPDATE.md`, `docs/DAEMON.md`), `fledge.toml`,
   `allowlist.example.toml`, spec prose, deltas, module testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
