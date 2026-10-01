---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: design
---

# Design

- **Settings** (`src/autonomous/enabled.ts`, next to the AUTONOMOUS-1 gate):
  the one-line scrape is pulled out of `parseAutonomousConfig` into
  `scanTomlKeys` (same behaviour; the autonomous tests are unchanged).
  `parseExtrasSettings` reads `corvidinho.plugins.work|schedule` (table,
  dotted or inline table); `parseExtrasSettingsJson` reads a `.json`
  allowlist file's `corvidinho.plugins`. `loadExtrasToggles` reads
  `<installRoot>/fledge.toml` and `resolveAllowlistPath(env, home)` with
  `readFileSync` on every call; ENOENT is "not set"; any other read error or
  a JSON parse error is `config-unreadable` for both extras (fail closed);
  `combineExtrasReads` makes off-in-either off. Messages name the source
  ("the install's fledge.toml" / "the allowlist file"), never a path.
  `trackExtraState` turns a reader into one that reports changes (daemon
  events, the bridge's scheduler line).
- **Why two places**: the install root's `fledge.toml` is a tracked file the
  box updater resets with `git checkout --force`, so an off kept only there
  would come back on after an update (fail open against "until I turn them
  off"). The owner's allowlist file is outside the checkout, out of reach of
  the agent's file tools, kept verbatim by the /admin writer, and shared by
  the bridge and the daemon. Off in either is off.
- **Slash** (`slash-dispatch.ts`): `CommandEntry.extra` on `work` and
  `schedule`; after the mute/rate gate and the unknown-command check, before
  minPermission: `ctx.extraState?.(extra)` off ⇒ ephemeral `extraOffReply`
  (owner: plus why/how) and `{ ok: false, reason: "extra_disabled" }`.
  `SlashContext.extraState` is optional (unset ⇒ on), so every existing
  handler test is unchanged.
- **/work talk** (`bridge.ts`): `WorkStore.isWorkSession(sessionId)`. In
  `onMessage`, for `continue_session` on a `/work` talk, after the stop
  checks and the run-queue wait (so `stop` still reaches a run and a waiting
  message sees the setting as it is when it would run) and before the
  expired-ask clear, thin-ack / cancel and the run: post the fixed line
  (channel; never the owner hint) and track it on the session. In
  `onComponent`, after the not-for-you check: the requester's press on a
  `/work` talk's ask gets `extraOffReply` ephemerally. In the router,
  `RouterDeps.refuseResume(priorSessionId)` is asked before an expired
  session's retained conversation is resumed (SESSION-3.a); the bridge
  answers the fixed line for a `/work` talk's while `work` is off, so the
  router returns `refuse` with it and no new session is made (checking after
  `resumeFromRetained` would already have re-pointed the conversation at a
  plain chat session). Nothing in flight is aborted.
- **Scheduler** (`service.ts`): `schedulesEnabled?: () => boolean`; `tick()`
  computes `due = schedulesOn() ? dueSchedules(now) : []` (re-read + listDue
  only when on), so the loop (open-ask skip, claim, spawn) sees nothing,
  while `onTick`, `deliverPendingAsks`, `spendDm.deliver` and `backup.tick`
  run as before. A throw is off and logged as a tick-hook failure.
- **Bridge wiring**: `extraState(name)` reads fresh and logs each
  `config-unreadable` refusal; one start-up line per extra that is off; the
  scheduler gets `schedulesEnabled` through `trackExtraState` (one
  `[discord] scheduler schedule: …` line per change; the ticker reads
  without the per-refusal warning so an unreadable file is not logged every
  tick).
- **Daemon**: the same reader on its `projectRoot`; `daemon.started` carries
  `schedules`; `schedules.off` (warn, with why) / `schedules.on` per change.
- **Config files**: `fledge.toml` and `allowlist.example.toml` get a
  commented `[corvidinho.plugins]` block; this checkout ships both on.
- Not touched: execute.ts, the DB schema, roles, people, the allowlist loader,
  audit, scrub, the injection guard, spend, the updater script, /status.
