---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: docs
---

# Docs

`src/agent/spawn-argv.ts` header documents why `--config=/dev/null` is passed; the SAFE-2 refusal message now names bunfig.toml. No user-facing docs change.
