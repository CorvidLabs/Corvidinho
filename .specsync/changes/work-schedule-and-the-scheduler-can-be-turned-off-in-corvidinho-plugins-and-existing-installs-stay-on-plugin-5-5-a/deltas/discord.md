---
module: discord
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
---

# Delta: discord (/work, every /schedule subcommand, a resumed /work talk and the scheduler's runs stop while turned off — PLUGIN-5 / PLUGIN-5.a)

## Added

### REQUIREMENT REQ-discord-157

PLUGIN-5 / PLUGIN-5.a on Discord. The bridge SHALL read the extras switch
(`loadExtrasToggles({ installRoot: config.projectRoot, env })`,
REQ-agent-157) fresh for every slash command, every message or button press
that would resume a `/work` talk and every scheduler tick, so no restart is
needed.

- Slash: `handleSlashInteraction` SHALL check a command's extra (`/work` →
  `work`, `/schedule` → `schedule`) after the channel, actor and
  mute/rate gates and before the minPermission floor and the handler. While
  it is off the reply SHALL be only the ephemeral `/<name> is turned off on
  this install.` — for the owner followed by why and how to turn it back on
  (`extraOffReply`; never a path or a file's contents) — and the result
  `{ ok: false, reason: "extra_disabled" }`; no session, worktree, work task,
  run, PR or schedule change SHALL happen. Every `/schedule` subcommand
  (list, create, pause, resume, delete) SHALL be refused. The commands stay
  registered; there is no `/admin` knob.
- `/work` talk: while `work` is off, a chat message that would continue a
  `/work` talk (`WorkStore.isWorkSession`; a reply to its answer, or an
  @mention routed to it as the author's active session in that channel)
  SHALL get the fixed line in the channel (never the owner hint) and run
  nothing, its open asks left as they were, checked when it would run; the
  requester's press on a `/work` talk's ask (open, pick, Answer form) SHALL
  get `extraOffReply` privately and resume nothing. A run in flight SHALL NOT
  be aborted by the switch, and `stop` / `cancel` and its Stop button SHALL
  still stop it.
- Scheduler: `SchedulerServiceOpts.schedulesEnabled` (unset ⇒ on; a throw ⇒
  off, logged) SHALL gate only the schedules part of `tick()` (store
  re-read, due scan, open-ask skip, claim): while off no run row is claimed
  and nothing is spawned, and the `onTick` hook (Approve / forget cards,
  stuck WATCH asks), the pending-ask delivery pass, the owner's spend DMs and
  the backup tick SHALL still run every tick. Runs in flight finish. Back
  on, the existing no-catch-up claim fires each overdue schedule at most
  once.
- Logs: one `[discord] <extra>: off (…)` line per extra that is off at
  start, one `[discord] scheduler schedule: …` line per change, and a line
  for each refusal while the settings are unreadable (`config-unreadable`).

Acceptance Criteria
- With `extraState` off for `work`, a team member's `/work` gets exactly `[{ content: "/work is turned off on this install.", ephemeral: true }]` and `{ ok: false, reason: "extra_disabled" }`; the session store, work store and agent stay untouched; the owner's reply starts with that line and names `[corvidinho.plugins]` and the allowlist file with no path.
- With `schedule` off, `/schedule` list / create / pause / resume / delete each get `/schedule is turned off on this install.` and the schedule store is unchanged; `/work` still runs; an off-allowlist channel, a deny-listed actor and a muted user keep their zero-width / `MUTED` replies; `/status` never reads the switch.
- A bridge with `work = false` in its allowlist file refuses `/work`; rewriting the file to `work = true` lets the next `/work` run; `work = false` in the install root's `fledge.toml` refuses it too.
- After an owner's `/work` answer, with `work = false`: a reply to that answer and the owner's @mention in the channel each get `/work is turned off on this install.` in the channel and no agent call; someone else's @mention still runs; back on, the reply resumes the same session.
- A `/work` run that stopped on a Choose ask: with `work = false` an open press and a pick press each get the line privately (with the owner hint), no agent call, the ask still open; back on, a pick resumes the session with the label.
- A `/work` run in flight is not aborted when `work = false` is written, and a `stop` reply to its progress message still stops it (`⏹ Stopped`).
- With `schedule = false` in the allowlist file, the bridge's 20 ms ticker leaves a due schedule unclaimed; rewriting the file lets it fire.
- `SchedulerService` with `schedulesEnabled` false: two ticks return `{ started: [], skipped: [] }` with no run row while `onTick`, `backup.tick` and `spendDm.deliver` each ran twice; true 5 h later fires the overdue schedule once; a throwing switch claims nothing; a pending stuck ask a daemon ticker left is posted by a tick with schedules off; a run in flight when it goes off completes.
- Fixture: `tests/plugins.extras-toggle.test.ts`; the docs gate-order check in `tests/docs.operator-facts.test.ts`.
