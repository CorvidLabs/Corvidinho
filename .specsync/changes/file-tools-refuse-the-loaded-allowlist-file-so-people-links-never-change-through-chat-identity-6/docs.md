---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: docs
---

# Docs

- `docs/discord.md` "Declared people": the note that the default
  `~/.config/corvidinho/` keeps the file out of the file tools' reach was
  false for a non-git `$HOME` project; it now says the file tools refuse
  the allowlist file wherever the process reads it from (`refused
  (IDENTITY-6)`, REQ-plugins-1204), the shell refuses it too (SAFE-21), and
  keeping it outside project folders is still the safe layout.
- `specs/plugins/plugins.spec.md`: public API note, IDENTITY-6 invariant,
  scenario, error row, files list. README, STATUS, CHANGELOG and
  `docs/DISCORD-GO-LIVE.md` are not made false by this change (release
  notes come with the next release PR).
