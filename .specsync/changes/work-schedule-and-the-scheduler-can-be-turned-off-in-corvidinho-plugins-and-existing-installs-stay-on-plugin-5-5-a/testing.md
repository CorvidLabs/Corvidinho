---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: testing
---

# Testing

`tests/plugins.extras-toggle.test.ts` (28 tests). Temp install roots and
allowlist files, in-memory or temp SQLite, injected agents and a null
gateway; the bridge cases rewrite the allowlist file between steps to prove
the live re-read; nothing touches this checkout or the operator's home.
Every run used a private `TMPDIR`.

Fail-on-base proof: with the base's (cf7f61b) `src/discord/bridge.ts`,
`src/scheduler/service.ts`, `src/daemon/daemon.ts`,
`src/discord/work-store.ts`, `src/discord/slash-types.ts` and
`src/discord/slash-dispatch.ts` swapped in (the new settings reader in
`src/autonomous/enabled.ts` kept, and the two reply helpers added to the
base's dispatch, so the file loads), `bun test
tests/plugins.extras-toggle.test.ts tests/docs.operator-facts.test.ts` gave
13 of the 28 new tests failing — the three dispatch refusals, five of the
six bridge cases (all but the stop case), the two scheduler gate cases and
the three daemon cases — plus the docs gate-order test. The 15 that pass
there are the settings units of the kept module and the must-not-break
guards (the channel / actor / mute replies, `/status`, a pending schedule ask
still delivered and a run in flight still completing with schedules off,
and a `/work` run still stoppable). With every modified source (and
`docs/discord.md`) from the base, the new file fails to load (the exports do
not exist) and the gate-order test fails. Restored: 28 of 28 pass, and the
related suites (`docs.operator-facts`, `autonomous.enabled`,
`discord.slash`, `discord.schedule`, `scheduler.service`,
`scheduler.ask-outbox`, `daemon`, `ops.backup-wiring`,
`discord.slash-reply-continuity`, `discord.stop-run`,
`discord.slash-choose-ask`, `allowlist.toml-multiline`; 269 tests) pass,
as does the full `bun test`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-157` | `tests/plugins.extras-toggle.test.ts` ("absent or literal true is on …", "the dotted and inline-table spellings …", "a key under a later table …", "a .json allowlist file …") | Absent / `true` on; `false`, `"false"`, `"true"`, `0`, `1`, an inline table, `no` off; `plugins.work` and `plugins = { … }` under `[corvidinho]` the same key; later tables, `[merlin.plugins]` and `council` ignored; a duplicate key is off unless every copy is `true`; the JSON object reads the same and bad JSON throws. |
| `REQ-agent-157` | `tests/plugins.extras-toggle.test.ts` ("nothing set anywhere …", "off in either file is off …") | No files, this checkout's `fledge.toml`, no default allowlist under the home dir: both on. `work = false` in the install root's `fledge.toml` → `offIn: ["fledge.toml"]`; the allowlist file's `schedule = false` beats `fledge.toml`'s `true`; both → `["fledge.toml", "allowlist file"]`; the `.json` file and the default path under the home dir are read. |
| `REQ-agent-157` | `tests/plugins.extras-toggle.test.ts` ("a settings file that cannot be read …", "[corvidinho.autonomous] has no say …", "combineExtrasReads …", "trackExtraState …") | A directory `fledge.toml` → both `config-unreadable` with `the install's fledge.toml could not be read (EISDIR)`; bad JSON → `the allowlist file could not be parsed`; the log line; autonomous off leaves both on; unreadable wins over off; the tracker reports `->on`, `on>off`, `off>config-unreadable`, `config-unreadable>on` only. Fail on full base (no exports). |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("/work: only the fixed ephemeral line …", "the owner also gets why …", "/schedule: every subcommand is refused …") | `/work` off: exactly the ephemeral line, `extra_disabled`, no session / work task / agent call, one read; the owner's reply adds why with no path; `extraOffReply` for `config-unreadable`; all five `/schedule` subcommands refused, store unchanged, `/work` still runs. Fail on base. |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("the switch runs after the channel, actor and mute gates …", "other commands never read the switch …") | Off-allowlist channel and deny-listed actor keep the zero-width ack, a muted user `MUTED`; `/status` never reads it; unset is today's `/work`. Pass on base (guards). |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("/work off in the allowlist file is refused …", "off in the install root's fledge.toml is off too") | The bridge refuses `/work` with the owner hint and runs nothing; rewriting the file to `work = true` lets the next `/work` run (no restart); a `fledge.toml` off refuses a team member with the line only. Fail on base. |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("a reply that would resume a /work talk …", "a press on a /work talk's ask …") | With `work = false`: a reply to the `/work` answer and the owner's @mention each get the line in the channel and no agent call, someone else's chat runs, back on the reply resumes the same session; an open and a pick press each get the line privately with the owner hint, no run, the ask still open; back on a pick resumes it. Fail on base. |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("turning /work off does not stop a /work run in flight …") | The run is not aborted when the file turns `/work` off; a `stop` reply stops it once (`⏹ Stopped`). Pass on base (guard). |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("schedule = false: the bridge's ticker claims no run …") | A due schedule stays unclaimed for 200 ms of 20 ms ticks; rewriting the file fires it. Fail on base. |
| `REQ-discord-157` | `tests/plugins.extras-toggle.test.ts` ("off: no run is claimed or started …", "a throwing switch counts as off", "off: a schedule question another ticker left pending is still posted …", "turning it off does not stop a run in flight") | Two off ticks claim nothing while `onTick`, `backup.tick` and `spendDm.deliver` ran twice each; back on 5 h later fires once; a throw claims nothing; a daemon-left stuck ask is posted by an off tick; an in-flight run completes. The first two fail on base; the last two pass there (guards). |
| `REQ-discord-157` | `tests/docs.operator-facts.test.ts` ("gate order names the actor gate …") | `slash-dispatch.ts` and `docs/discord.md` both name `mute/rate → extras switch (PLUGIN-5.a) → minPermission`. Fails on base. |
| `REQ-cli-157` | `tests/plugins.extras-toggle.test.ts` ("off: daemon.started says so …", "on by default …", "an install-root fledge.toml that cannot be read …") | `schedules: "off"` then one `schedules.off` (`reason: "off"`, `offIn: ["allowlist file"]`), two ticks claim nothing while `backup.ok` writes one snapshot, then one `schedules.on` and the schedule runs; nothing set → `schedules: "on"`, it runs; a directory `fledge.toml` → `config-unreadable` with the EISDIR error, nothing runs. Fail on base. |
