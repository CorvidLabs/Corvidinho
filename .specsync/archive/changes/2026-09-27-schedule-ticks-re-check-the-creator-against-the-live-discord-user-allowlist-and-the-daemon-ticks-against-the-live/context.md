---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: context
---

# Context

Captured HI (`hi/discord.md`, not retired): **DISCORD-SCHEDULE-3** "Schedule
ticks respect existing channel/user allowlists and SAFE gates; a schedule
cannot post or act outside channels/repos I already allow." Issues #102, #105
(their COS-* ids are drafts and are not used here).

Gap on origin/main (fc0ed8d), found in the w9 scoping pass:

- The **user** allowlist was never checked at tick time. `SchedulerService.runOne`
  ran and posted as `schedule.createdByUserId` after a channel check only,
  without the ingress actor gate `gateActor` (REQ-discord-201). Repro: a
  schedule by `creator-1` in `chan-ok` with `channels=["chan-ok"]` and
  `denyUsers=["creator-1"]` (or `users=["someone-else"]`, creator not the
  owner): one `tick()` ran the agent once and posted to `chan-ok`, while a
  live message from that user is refused. REQ-discord-020 had narrowed the HI
  to "re-check channel allowlists".
- `corvidinho daemon` loaded the allowlist once at start and never again, so
  after `/admin channels remove` (or users/deny edits) in the bridge rewrote
  the file, a running daemon kept running the removed channel's schedules
  until restart. It also passed no `owner` to `SchedulerService`.

Already met on main (kept): channel re-check before the run and before the
post, project re-resolve at tick (REQ-discord-202), ADMIN-only create,
non-interactive non-ADMIN spawns (SAFE-1 / ROLES-CHAT-3), per-run worktrees.

Constraints: no new env var, config key, slash command or option; no SQLite
schema bump; no ACCESS/bounty/MainNet surfaces. Mutes stay in-memory in the
bridge and are not part of the tick gate. Left out on purpose (question for
Leif): schedule runs spawn non-ADMIN, so their GitHub *read* tools use the
ROLES-CHAT-8 community path for public repos outside the GitHub allowlist;
writes are already refused.
