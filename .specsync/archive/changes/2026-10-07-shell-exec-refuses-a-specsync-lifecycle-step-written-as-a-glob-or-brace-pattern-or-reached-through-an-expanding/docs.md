---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: docs
---

# Docs

- Specs: `plugins.spec.md` (the AGENT-18.a paragraph: patterns, the
  expanding / xargs subcommand, never-run commands, residuals),
  `requirements.md` (REQ-plugins-1818 modified), `testing.md` (evidence).
- No operator doc change: `docs/DISCORD-GO-LIVE.md` and `docs/discord.md`
  already say `shell-exec` refuses these steps in every repo; the new forms
  are spellings of the same commands. No README, CHANGELOG, STATUS or
  package.json edit (the release PR writes them).
