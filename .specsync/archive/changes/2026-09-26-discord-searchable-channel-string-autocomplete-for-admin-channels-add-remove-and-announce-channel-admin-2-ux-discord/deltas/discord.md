---
module: discord
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
---

# Delta — discord (searchable channel STRING+autocomplete)

## Modified

### REQUIREMENT REQ-discord-043

The bridge SHALL register one owner-only `/admin` slash command with
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2) and
`config show` (ADMIN-3). The dispatcher SHALL require ADMIN and the handler
SHALL re-check ADMIN before doing anything else (ADMIN-4 / DISCORD-7); with
no owner nobody can run it (IDENTITY-2/3).

Mutations SHALL edit only `[discord].users` / `[discord].channels` in the
allowlist file the bridge already reads (the loaded file, else
`CORVIDINHO_ALLOWLIST_FILE`, else `~/.config/corvidinho/allowlist.toml`,
created 0600 when missing), written atomically (temp file in the same
directory, fsync, rename; mode kept) with every other line, section and
comment kept. The live allowlist SHALL be recomputed as file ∪ env and
updated in place so it applies without a restart. Env values SHALL NOT be
written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, and which knobs are updatable. Each mutation SHALL append SAFE-5
audit rows (`started` before the write, failing closed when the trail is
unavailable, then `ok`/`error`); refusals SHALL append `denied`. The gateway
SHALL flatten subcommand-group options.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- Fixture tests only; no live Discord token or network.

### REQUIREMENT REQ-discord-009

Slash command set SHALL include `/schedule` (list|create|pause|resume|delete),
`/announce` (channel|show) and `/admin` (users add | channels add|remove |
config show, REQ-discord-043) in addition to
session/status/agents/work/mute/unmute. Registration overwrites the
**current** body set (nine commands), not a frozen six, seven or eight.
`/session start` and `/work` MAY accept an optional `project` string option
for explicit project selection (SESSION-WORKTREE-4 / REQ-discord-022). No
other new slash command names beyond schedule/announce/admin.

Acceptance Criteria
- `buildSlashCommandBodies()` includes schedule with list/create/pause/resume/delete.
- `buildSlashCommandBodies()` includes announce with channel|show and STRING + autocomplete (searchable channel).
- `buildSlashCommandBodies()` includes admin with users add, channels add|remove and config show groups.
- Session start + work have optional `project`.
- Bodies remain fixture-testable without live Discord.
- Mute/unmute and prior DISCORD-4 commands still present.
