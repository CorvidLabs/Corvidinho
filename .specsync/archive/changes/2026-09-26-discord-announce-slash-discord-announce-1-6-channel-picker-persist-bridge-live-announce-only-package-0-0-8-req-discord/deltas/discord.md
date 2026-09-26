---
module: discord
change: discord-announce-slash-discord-announce-1-6-channel-picker-persist-bridge-live-announce-only-package-0-0-8-req-discord
---

# Delta — discord (DISCORD-ANNOUNCE `/announce`)

## Added

### REQUIREMENT REQ-discord-024

Corvidinho SHALL expose Discord slash `/announce` with subcommands `channel` and
`show` so an ADMIN can set or clear a dedicated ops/dev announcements channel
for version bumps, bridge restarts, and ship notes — separate from the
dogfood/chat allowlist (DISCORD-ANNOUNCE-1..6).

The `channel` subcommand SHALL use Discord’s native **CHANNEL** option type
(guild text channel picker / dropdown) plus an optional boolean `clear`.
Operators SHALL select from the picker and SHALL NOT be required to type a
snowflake by hand (DISCORD-ANNOUNCE-2).

Mutations (`channel` set/clear) SHALL re-check ADMIN at handler time
(DISCORD-7 / ADMIN-4 / DISCORD-ANNOUNCE-5); empty admin/owner lists SHALL
deny-all. Non-admins SHALL receive the existing ephemeral `"not authorized"`
deny. `show` MAY be used by allowlisted actors after normal channel and
rate/mute gates.

The configured channel id SHALL persist on the bot VM in the shared Corvidinho
SQLite database (`schema_meta` key `discord_announce_channel_id` under
`~/.local/share/corvidinho/` / `CORVIDINHO_DATA_DIR`) across restarts
(DISCORD-ANNOUNCE-6). Empty / missing SHALL mean not configured — **default-deny**:
no announce posts until set (DISCORD-ANNOUNCE-3).

A shared helper `postAnnouncement(content)` SHALL post **only** to the
configured announcements channel. After every successful bridge restart
(`ClientReady`), when configured, Corvidinho SHALL post a short
`bridge live vX.Y.Z` note via that helper — never to the general allowlisted
chat by default (DISCORD-ANNOUNCE-4). `/announce show` and `/status` SHALL
surface the current announcements channel (or not-configured).

Package version SHALL bump to **0.0.8**. Slash registration SHALL overwrite the
**eight**-command set (prior seven + `/announce`). Fixture tests without live
Discord. No ProcessManager; secrets out of repo.

Acceptance Criteria
- `/announce` registered with channel|show; CHANNEL option type + optional clear.
- Admin can set/clear; non-admin / empty admin denied; show works when empty or set.
- Persist/reload channel id from shared SQLite across reopen.
- `postAnnouncement` no-ops when unset; posts only to configured channel when set.
- ClientReady posts bridge-live note only to announce channel (not dogfood allowlist).
- `/status` includes announcements line.
- Package `0.0.8`; register count 8; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

## Modified

### REQUIREMENT REQ-discord-009

Slash command set SHALL include `/schedule` (list|create|pause|resume|delete)
and `/announce` (channel|show) in addition to session/status/agents/work/mute/unmute.
Registration overwrites the **current** body set (eight commands), not a frozen
six or seven. `/session start` and `/work` MAY accept an optional `project`
string option for explicit project selection (SESSION-WORKTREE-4 /
REQ-discord-022). No other new slash command names beyond schedule/announce.

Acceptance Criteria
- `buildSlashCommandBodies()` includes schedule with list/create/pause/resume/delete.
- `buildSlashCommandBodies()` includes announce with channel|show and CHANNEL picker.
- Session start + work have optional `project`.
- Bodies remain fixture-testable without live Discord.
- Mute/unmute and prior DISCORD-4 commands still present.

### REQUIREMENT REQ-discord-016

Guild PUT overwrite SHALL register the current `buildSlashCommandBodies()` set
(eight commands including `/announce`) then clear globals when guild id is set.

Acceptance Criteria
- Guild register path PUTs eight bodies then clears globals.
- Global-only path warns when guild id unset.
- `discord register-commands` CLI still works against live Discord when configured.

### REQUIREMENT REQ-discord-018

Operator docs (`docs/discord.md`) SHALL document `/schedule` and `/announce`
alongside the prior slash inventory, DISCORD-SCHEDULE behavior, DISCORD-ANNOUNCE
behavior (announce-only posts; default-deny until set; announcements mermaid
docs-only), MEMORY inject notes, and per-talk worktree isolation, optional
`project` on `/session start` and `/work`, schedule project scope, and
`WORKTREE_BASE_DIR` / `.corvid-worktrees` rooting (SESSION-WORKTREE /
REQ-discord-022).

Acceptance Criteria
- `docs/discord.md` lists `/schedule` subcommands and admin mutation note.
- `docs/discord.md` lists `/announce` subcommands and announcements section with mermaid.
- `docs/discord.md` covers SESSION-WORKTREE behavior and env.
- Deny flowchart / mermaid-docs-only note unchanged in intent.
