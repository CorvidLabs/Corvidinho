---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: tasks
---

# Tasks

- [x] Regression tests for registration, argv / cwd / env, SAFE-1 and tier gates, abort / timeout, missing toolchains, `plugins list` and a vanished binary; new tests fail on `main`.
- [x] `node-exec` / `python-exec` / `cargo-exec` commands: dangerous, minTier 2, argv-only bounded spawn pinned to the plugin cwd with the verify-lane env scrub.
- [x] Runner loader resolves toolchains on absolute PATH entries, registers only what it finds, reports what is missing; wired into builtins and `plugins list`.
- [x] Delta adds REQ-plugins-313 / 314 and modifies REQ-cli-112; plugins and cli spec, testing and tasks companions and `docs/DISCORD-GO-LIVE.md` updated.
- [x] specsync check, tsc, bun test, fledge verify green.
