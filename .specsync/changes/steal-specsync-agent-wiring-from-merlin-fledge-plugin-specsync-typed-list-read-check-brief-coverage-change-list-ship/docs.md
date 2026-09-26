---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: docs
---

# Docs

- STATUS: SpecSync agent tools + verify-lane spec-check; CI Spec Sync Action remains dedicated workflow
- AGENTS.md: plugins run specsync-*; Planning loads specs; done-gate includes spec-check via fledge verify
- CLI help: document plugins + optional `specsync` subcommand
- fledge.toml comments: local verify includes spec-check; CI Action still separate (no reimplement)
