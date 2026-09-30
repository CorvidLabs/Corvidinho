---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: design
---

# Design

- `src/scheduler/service.ts`:
  - `scheduleInjection(text, role)`: `inboundInjection` over the name,
    description and prompt (null for the owner), reason ids merged in
    `INJECTION_REASONS` order. Shared by the create handler and the tick.
  - `injectedScheduleQuestion(reasons)`: fixed stuck question ("🛡️ I didn't
    run this schedule: its text looks like a prompt-injection attempt (it …).
    I paused it; /schedule delete removes it. (SAFE-13)"), never the text.
  - `SchedulerServiceOpts.recordAudit?` and `mutedUsers?` (optional; the
    bridge wires both; the daemon writes no audit rows today and logs
    `run.finished` / `run.needs_human` instead).
  - `runOne`: after `gateTick`, `creatorRole(schedule)`
    (`resolveDiscordActingRole` with the live allowlist, owner, mute set and
    `loadDeclaredPeople`; throws read as community). A hit →
    `refuseInjectedRun`: a `[scheduler] SAFE-13` log line (reason ids, for a
    schedule with no channel too), `auditInboundInjection` (surface
    `scheduler:<id>`, source `schedule-prompt`), `finish` failed with the
    stuck ask, `setStatus(paused)` unless the failure auto-paused it, then
    `postOwnRunAsk(..., { handBack: true })`. No worktree is created.
  - Prompt: owner → unchanged; anyone else → `Scheduled work on project:
    <project>`, the worktree line, `fenceSpeakerText("Schedule \"<name>\":\n
    <prompt>", role, "schedule-prompt")`, the closing SAFE line. `runChat`
    options unchanged (`actingIsAdmin: false`, no acting role: SAFE-3.a).
- `src/discord/command-handlers/schedule.ts`: for `create`,
  `refusedAsInjection` runs before `requireAdmin`: role as `/work` resolves
  it, `scheduleInjection({ name, prompt }, role)`, and on a hit
  `refuseInjectedSlash` with an interaction wrapper whose `reply` adds
  `ephemeral: true`. Nothing is stored.
- `src/discord/injection-guard.ts`: `SpeakerSurface` gains
  `schedule-prompt`. `refuseInjectedSlash` is unchanged.
- `src/discord/bridge.ts`: passes `mutedUsers` and `recordAudit` to the
  scheduler.
- No env var, config key, table, column or schema version.

Design choices pending Leif:

1. **Pause on a tick-time hit.** Stored text that trips the detector runs
   nothing and the schedule is paused, so the owner gets exactly one note
   and later ticks neither run nor repeat it. Alternative: skip each tick and
   keep it active (the same stuck ask each tick, pinging once, auto-pause
   after five).
2. **Private refusal at create.** Every `/schedule` reply is ephemeral, so
   the requester's refusal is too; the owner still gets one fresh public post
   in the channel pinging only them. `/work` and `/session start` keep their
   public refusal. Alternative: public, as `/work`.
3. **Scan before the ADMIN gate.** A non-owner can never create a schedule
   (ADMIN is owner-only), so the scan runs first and turns a quiet
   `NOT_AUTHORIZED` into a SAFE-13 refusal the owner hears about. An ordinary
   non-owner create is still the quiet `NOT_AUTHORIZED`.
4. **The name goes inside the fence** for a non-owner creator (it is their
   words too) and leaves the first prompt line; the owner's prompt is
   byte-identical to before.
5. **Tick role without Discord role ids.** A tick has no member roles, so a
   team member allowlisted only by a Discord role is fenced as community
   (the DISCORD-SCHEDULE-3 gate already refuses such a creator when the user
   list is non-empty).
6. **No daemon audit row.** The bridge's ticker writes the `denied` row; the
   daemon has no audit trail wired today and logs the refusal
   (`run.finished` error, `run.needs_human`), and its ask is posted by the
   bridge.
7. **A schedule without a channel** has no post to carry the owner's note:
   the refusal is the log line, the audit row, the run row's ask and the
   paused status. Alternative: send it to the `/announce` channel or a DM.
