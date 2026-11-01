---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: docs
---

# Docs

- `docs/discord.md` "Declared people": the note that the default
  `~/.config/corvidinho/` keeps the file out of the file tools' reach was
  false for a non-git `$HOME` project; it now says the file tools refuse
  the allowlist file wherever the process reads it from (`refused
  (IDENTITY-6)`, REQ-plugins-1204), the shell refuses a command that names
  it (SAFE-21), and code the language runners or a shell command run
  (owner's talk worktree only, SAFE-3.a) is not checked, so keeping it
  outside project folders is still the safe layout. The old "No plugin or
  chat path writes people" now reads "The file tools never write people".
- `specs/plugins/plugins.spec.md`: public API note, IDENTITY-6 invariant,
  scenario, error row, files list. README, STATUS, CHANGELOG and
  `docs/DISCORD-GO-LIVE.md` are not made false by this change (release
  notes come with the next release PR).
