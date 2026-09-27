---
id: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
state: verifying
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root)

## Intent

PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root)

## Affected Canonical Specs

- `plugins`
- `cli`

## Acceptance Criteria

- When node, python3 (else python) or cargo resolves on an absolute PATH entry at builtin load, plugins list and the code-tier tool catalog show node-exec, python-exec and cargo-exec, each dangerous=true and minTier=2 (SAFE-1 non-interactive deny unless allowlisted; not offered to non-ADMIN role sessions, below code tier or without dangerous tools); each runs its toolchain's absolute binary with the model's argv verbatim (no shell, no expansion, flags kept) with cwd pinned to the plugin cwd, the verify lane's scrubbed env without CDPATH/OLDPWD, a timeout, per-stream output caps and process-tree kill on the calling run's abort (exit 130) or timeout (exit 124); a non-zero exit is ok:false with that code; when a toolchain is missing its runner is not registered or offered, plugins list still exits 0 and prints a line naming each missing tool, other builtins (shell-exec, files-*) are unaffected, and a registered binary that disappears returns exit 127 instead of throwing; no new slash command, env var or config key

## No-spec Rationale

Not applicable
