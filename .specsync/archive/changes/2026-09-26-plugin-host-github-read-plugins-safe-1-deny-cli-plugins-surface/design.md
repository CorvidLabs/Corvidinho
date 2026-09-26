---
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
artifact: design
---

# Design

- In-process Map registry; `runPlugin` enforces dangerous∧nonInteractive∧¬allowlist → exit 2.
- Builtins authored under `plugins/`; loaded once via `loadBuiltins`.
- GitHub: thin `ghJson` wrapper; read-only (`dangerous: false`).
- SAFE-1 demo: `danger-ping` (`dangerous: true`).
- Allowlist: `CORVIDINHO_ALLOWLIST` comma/space-separated.
