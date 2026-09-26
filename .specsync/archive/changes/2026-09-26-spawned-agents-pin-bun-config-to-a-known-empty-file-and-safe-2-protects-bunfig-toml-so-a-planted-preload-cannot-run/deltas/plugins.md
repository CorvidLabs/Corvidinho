---
module: plugins
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
---

# Delta — plugins (SAFE-2 protects bunfig.toml)

## Modified

### REQUIREMENT REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, and keystore-like basenames (`*keystore*`,
`wallet-keystore.json`).

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.
