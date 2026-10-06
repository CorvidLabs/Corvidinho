---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: context
---

# Context

Tracked under issue #82 per the build brief (M3/M4 wave, slice
"plugin-toggles"). PLUGIN-5 and PLUGIN-5.a are captured on main in
`hi/plugin.md` (PLUGIN-5.a from Leif's 2026-09-28 interview, round 10:
"/work and /schedule (+ scheduler tick) toggleable via `[corvidinho.plugins]`
config (or /admin); default on"). Nothing new is captured in this change.

What was missing on main (cf7f61b): nothing turned `/work` or `/schedule`
off. `slash-dispatch.ts` mapped both unconditionally, their handlers checked
only the allowlist, the role and ADMIN, and `SchedulerService.tick` claimed
every due schedule in the bridge and the daemon. The only switch,
`[corvidinho.autonomous]`, covers `delegate` / `council` and ships off, so
gating `/work` and `/schedule` on it would have turned both off on existing
installs, against PLUGIN-5.a.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no /admin knob; no new env var; the tick's other jobs (backup,
cards, stuck WATCH asks, schedule asks, spend DMs) must keep running. Where
a design question remained, the conservative defaults recorded for this
slice in `/home/user/coord/m34-defaults.md` (plugin-toggles rows) are used
and listed in the PR under "Design choices pending Leif".
