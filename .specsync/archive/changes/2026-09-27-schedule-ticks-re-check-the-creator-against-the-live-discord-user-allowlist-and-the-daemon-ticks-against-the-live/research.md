---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: research
---

# Research

- `gateActor` (`src/discord/permissions.ts`) is the ingress actor gate:
  deny roles, then `resolvePermissionLevel` — `denyUsers` → BLOCKED (before
  the owner check, so a deny-listed owner is refused), owner → ADMIN, listed
  user or role → STANDARD, empty user+role lists → STANDARD, else BLOCKED.
  Schedules store no member roles, so at tick only the user id and the owner
  can admit the creator when a list is non-empty.
- Only `/schedule create` (`src/discord/command-handlers/schedule.ts`)
  creates schedules, with `createdByUserId = interaction.userId` (a Discord
  snowflake); create is ADMIN-only, i.e. owner-only (IDENTITY-2), so today's
  creators are normally the owner.
- Bridge: `SchedulerService` gets `config.allowlist` and `config.owner`;
  `/admin` `commitAdminListChange` splices the live lists in place, so the
  bridge ticker already sees live edits once it reads them per run.
- Daemon: `loadAllowlist({ env })` once at start; `tryLoadAllowlist` wraps
  it and returns the loader's value-free error for an unreadable/unparsable
  file (a missing file is fine: env only). `loadOwnerConfig({ env })` never
  throws. `mergeChannelIds` adds `DISCORD_CHANNEL_IDS`.
- `SchedulerService` reads `this.allowlist.discord` / `.github` at each
  use, so replacing those fields on the shared object applies to the next run
  and to in-flight runs' later checks.
- Existing scheduler tests use empty user/role lists, so they stay green; the
  daemon test fixture inherited `process.env`, so an operator's
  `CORVIDINHO_DISCORD_ALLOW_USERS` / owner env could change outcomes now that
  the daemon gates the creator.
