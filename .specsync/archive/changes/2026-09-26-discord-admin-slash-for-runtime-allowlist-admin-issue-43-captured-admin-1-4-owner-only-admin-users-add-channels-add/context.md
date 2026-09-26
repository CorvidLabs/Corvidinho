---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: context
---

# Context

Issue #43 asks for runtime Discord slash admin (approve/add users, add
channels, update config) beyond the shipped DISCORD-7 re-auth. Leif has
since captured ADMIN-1..4 in `hi/admin.md`; `docs/hi-drafts/ADMIN.md` is
historical provenance only. IDENTITY-2 (#141) made ADMIN owner-only:
`resolvePermissionLevel` returns ADMIN only for the configured owner, and no
owner means nobody is ADMIN.

Before this change the only way to add a user or channel was to SSH the bot
VM, edit `~/.config/corvidinho/allowlist.toml` (or env) and restart the
bridge. The DISCORD-DENY-2 admin tip still told the owner to do exactly that.

Constraints carried in: one store (the allowlist file/env the bridge already
reads, never a second DB table), empty = deny-all stays, env is not writable
at runtime, secrets never echoed, fixture tests only. Leif's planning comment
on #43 lists further admin needs (people/roles #36/#65, repo allowlist growth
draft ALLOW-7 #90, spend caps #98, audit verify #95, re-scrub #66); none is a
captured ADMIN criterion, so they stay out of this change.
