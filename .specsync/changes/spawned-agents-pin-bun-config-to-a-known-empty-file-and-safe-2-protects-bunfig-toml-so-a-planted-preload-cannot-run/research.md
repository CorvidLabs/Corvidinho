---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: research
---

# Research

Checked on Bun 1.4.2:

- Bun reads only `$cwd/bunfig.toml` as local config (not `.bunfig.toml`, not a parent directory's bunfig); a top-level `preload` runs before the entrypoint under `bun <file>`.
- `--config=<file>` replaces the cwd lookup; `--config=/dev/null` loads an empty config and the planted preload does not run. `-c` is not the config short flag.
- A missing `--config` file is a hard error (ENOENT, exit 1), so a path derived from the bin location (e.g. `dirname(bin)/../bunfig.toml`) would break spawns of any bin outside this checkout layout.
- This repo's `bunfig.toml` only sets `[test] preload`, which `bun <file>` ignores, so a known-empty config is behaviorally identical for the spawned `task run`.
