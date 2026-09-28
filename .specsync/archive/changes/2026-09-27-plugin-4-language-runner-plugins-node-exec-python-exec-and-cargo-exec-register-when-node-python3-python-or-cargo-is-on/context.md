---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: context
---

# Context

PLUGIN-4 (captured in `hi/plugin.md`, no retire line): "Language runners I care
about on Linux (at least shell plus node/python/cargo when present) show up as
plugins that degrade cleanly when the toolchain is missing." Issue #83.

Gap on `main` (fc0ed8d): the shell part is met (`shell-exec`,
REQ-plugins-086..088). No plugin exists for node, python or cargo:
`src/plugins/builtins.ts` registers only autonomous, discord, files, git,
github, memory, meta, search, shell, specsync and web, so `plugins list` shows
no runner even with all three installed, and nothing reports a missing
toolchain. The Fledge bridge (PLUGIN-3) offers no language-runner plugin
either. `runPlugin` rethrows handler exceptions, so a naive `Bun.spawn` of a
missing binary would throw out of the run.

Constraints: HI-first — only PLUGIN-4 plus the already-captured PLUGIN-2 /
SAFE-1 / SAFE-3 apply; no new slash command, env var or config key; no schema
change; `plugins/shell/clamp.ts` is being changed by another PR and is not
touched. Runners execute code, so they must be dangerous and at least as
restricted as `shell-exec` (cwd pinned to the project root, minTier code).
