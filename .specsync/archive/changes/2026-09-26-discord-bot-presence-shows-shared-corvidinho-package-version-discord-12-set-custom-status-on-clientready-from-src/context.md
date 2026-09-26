---
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
artifact: context
---

# Context

Leif wants the live Discord bot to show the Corvidinho package version under the
bot name (custom status / presence) so dogfood can tell which build is running
without opening `/status`. HI criterion DISCORD-12 (confirmed this ask). Shared
version already lives in `src/version.ts` / package.json for CLI and `/status`.

Constraints: HI-first; keep status string short (e.g. `v0.0.3`); prefer Custom
Status via discord.js when supported for bots; do not invent extra status chrome;
do not break slash registration or allowlists; Linux-only; secrets out of repo;
SpecSync + fledge verify green. DISCORD-11 retired after accidental `--help` capture.
