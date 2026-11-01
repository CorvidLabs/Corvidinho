---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: context
---

# Context

IDENTITY-6 is captured on main (`hi/identity.md`): "Only I add, change or
remove a person's links, never through chat." ALLOW-6 (`hi/allow.md`) backs
it: "Widening an allowlist is an explicit config change I make; the agent
does not grow trust from chatting with someone new." Nothing new is captured
here; `hi check` passes unchanged.

What was wrong on main (49273ff4), found by the W14 audit and reproduced
here: `files-write`, `files-edit` and `files-delete`
(`plugins/files/commands.ts`) only asked `refuseProtected` (SAFE-2,
SpecSync records, AGENT-1.b, personas), `refuseHi` and
`refuseSecretForRole`; none knew `resolveAllowlistPath`. In a non-git
project the owner's talk runs in the folder itself (AGENT-1.a), so when
`CORVIDINHO_ALLOWLIST_FILE` points inside it, or the bridge runs with a
non-git `$HOME` as the project (the default
`~/.config/corvidinho/allowlist.toml` is then under the project), one owner
chat run could edit `[people.<id>]` links and roles and skip `/admin people`
and its SAFE-5 audit rows. The shell already refuses the file (SAFE-21 secret
places, `plugins/shell/footguns.ts`), and `docs/discord.md` told the owner
the default location kept it out of the file tools' reach, which is false
for a non-git `$HOME` project.

Constraints: specs only through SpecSync; no new command, env var or config
knob; `/admin people` (ADMIN-3.a / ADMIN-3.b) and its audit unchanged;
writes to other project files unchanged.
