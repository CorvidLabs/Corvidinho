---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: design
---

# Design

- `src/scheduler/service.ts`: new private `gateTick(schedule)` —
  `gateActor({ userId: createdByUserId, allowlist: this.allowlist, owner:
  this.owner })`, then `checkChannel` when `channelId` is set. Refusal
  text: `creator not allowlisted: <scrubbed gate error>` (no user id) or the
  existing `channel not allowlisted: <channel id>`.
  - `runOne` calls it first (replacing the channel-only block): a refusal is
    `finish(ok:false)` before any worktree or agent spawn, so it counts
    toward `FAILURE_AUTO_PAUSE` exactly like a channel refusal.
  - The post path uses `gateTick` instead of `checkChannel`, so a creator
    refused mid-run gets no post (and, as for a channel, the pending spend
    warning / owner ping stay unclaimed).
- `src/daemon/daemon.ts`:
  - `daemonGate(allowlist, env)` helper: the start-time gate shape
    (`mergeChannelIds` for channels), reused per tick.
  - Start loads `owner = (await loadOwnerConfig({ env })).owner` once
    (same as the bridge's `config.owner`) and passes it to
    `SchedulerService`.
  - Each `tick()` first calls `tryLoadAllowlist({ env })`; failure →
    `log("error", "tick.allowlist_failed", { error })` and return an empty
    tick (fail closed; claims nothing, so due schedules stay due). Success →
    assign `sourcePath`, `github`, `discord` on the shared gate object
    in place, then `scheduler.tick()`.
- No change to the bridge wiring (it already shares the live allowlist and
  owner). No new env var, config key, option, slash command or schema change.
