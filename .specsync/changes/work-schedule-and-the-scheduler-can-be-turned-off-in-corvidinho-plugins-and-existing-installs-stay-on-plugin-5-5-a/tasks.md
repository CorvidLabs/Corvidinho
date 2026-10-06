---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: tasks
---

# Tasks

- [x] Confirm PLUGIN-5 and PLUGIN-5.a are captured on main; nothing new to capture; `hi check` passes.
- [x] `scanTomlKeys`, `parseExtrasSettings`, `parseExtrasSettingsJson`, `combineExtrasReads`, `loadExtrasToggles`, `extraStateLabel`, `formatExtraStateLog`, `extrasSourcePhrase`, `trackExtraState` in `src/autonomous/enabled.ts`; `parseAutonomousConfig` unchanged in behaviour.
- [x] Slash gate after mute/rate and before minPermission; `extraOffText` / `extraOffReply`; `SlashContext.extraState`.
- [x] `WorkStore.isWorkSession`; bridge message and press gates for a `/work` talk; in-flight runs untouched and stoppable.
- [x] `SchedulerServiceOpts.schedulesEnabled`: only refresh / due scan / claim gated; hook, ask delivery, spend DMs and backup keep running.
- [x] Bridge and daemon wiring; bridge log lines; daemon `schedules` field and `schedules.off` / `schedules.on`.
- [x] Review: an expired `/work` talk's conversation is not resumed while `/work` is off (`RouterDeps.refuseResume`); `plugins = <not a table>` under `[corvidinho]` is both off; the bridge's ticker logs the switch only on change.
- [x] `tests/plugins.extras-toggle.test.ts` (28 tests, 29 after review) and the docs gate-order test; fail-on-base proof recorded in testing.md.
- [x] `docs/discord.md`, `docs/DISCORD-GO-LIVE.md` (E.11), `docs/BOX-UPDATE.md`, `docs/DAEMON.md`, `fledge.toml`, `allowlist.example.toml`, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
