---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: requirements
---

# Requirements

- PLUGIN-4 (`hi/plugin.md`): node / python / cargo runners show up as plugins when present and degrade cleanly when the toolchain is missing.
- PLUGIN-2 / SAFE-1 (`hi/plugin.md`, `hi/safe.md`): each runner declares dangerous + minTier 2 and the runtime enforces it (non-interactive deny unless allowlisted).
- SAFE-3 (`hi/safe.md`): runners add no shell and no `cd`; the spawn cwd is pinned to the project root like `shell-exec`.
- Add REQ-plugins-313 (delta `deltas/plugins.md`): registration when the toolchain resolves, danger / tier, argv-only spawn pinned to the plugin cwd, scrubbed env, bounded spawn, abort / timeout kill the tree.
- Add REQ-plugins-314: a missing toolchain is not registered or offered, `plugins list` exits 0 naming it, a binary that cannot start returns exit 127 instead of throwing.
- Modify REQ-cli-112 (delta `deltas/cli.md`): the `plugins list` text view prints the runner status (loaded runners with their binary, one line per missing toolchain) before the Fledge line and still exits 0.
- REQ-plugins-086..088 unchanged. No new slash command, env var, config key or schema version.
