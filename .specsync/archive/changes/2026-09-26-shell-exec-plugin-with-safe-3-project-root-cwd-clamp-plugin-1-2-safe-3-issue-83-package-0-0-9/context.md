---
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
artifact: context
---

# Context

After files/search (#81 / package 0.0.6), STATUS P0 next is M3 plugins.
`hi/plugin.md` PLUGIN-1 lists **shell**; `hi/safe.md` SAFE-3 requires shell
commands cannot `cd` out of the project root. Issue #83 maps to shell cwd clamp.

Steal Merlin `fledge-plugin-shell` project-root clamp (#570): pin spawn cwd,
lexically refuse `cd`/`pushd` escapes before spawn. No new HI invented.

Also leave `docs/hi-drafts/WATCH-RELIABILITY.md` for Leif (WATCH summary after
ack / spawn outcome log / 403 backoff) — draft only, not `hi/` capture.
