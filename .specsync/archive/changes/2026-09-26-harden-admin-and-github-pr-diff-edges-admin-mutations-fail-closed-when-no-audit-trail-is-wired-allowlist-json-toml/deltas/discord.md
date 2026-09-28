---
module: discord
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
---

# Delta — discord (/admin hardening)

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
comment kept. The file SHALL be read and written as JSON exactly when the
allowlist loader reads it as JSON (one shared rule, `isJsonAllowlistPath`: a
case-sensitive `.json` suffix), else as TOML, so an edit always matches what
the next load reads. When that path is a symlink whose target does not
resolve (dangling or looping), the mutation, the atomic write and
`config show` SHALL refuse with a clear error, and the link SHALL NOT be
replaced by a regular file. The live allowlist SHALL be recomputed as file ∪
env and updated in place so it applies without a restart. Env values SHALL
NOT be written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, and which knobs are updatable. Each mutation SHALL append SAFE-5
audit rows (`started` before the write, then `ok`/`error`); refusals SHALL
append `denied`. A mutation SHALL fail closed with the same
`audit log unavailable (SAFE-5)` refusal, writing nothing, both when the
trail throws and when no trail is wired (a bridge without a DB); it SHALL
never write an unaudited change. The gateway SHALL flatten subcommand-group
options.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- With no audit trail wired (`recordAudit` unset), `users add` and `channels add` reply `audit log unavailable (SAFE-5)`, and the file and live lists are unchanged; `config show` still works.
- `allowlist.JSON` (TOML text) is edited as TOML, matching the loader, and reloads with the new entry; `allowlistFileFormat` agrees with `isJsonAllowlistPath` for every path.
- A dangling or looping symlink at the allowlist path is refused by `/admin`, `writeFileAtomic` and `config show`; the link stays a symlink and its target is not created.
- Fixture tests only; no live Discord token or network.
