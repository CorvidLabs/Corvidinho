---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: purpose and Public API name the runner loader; new invariant for the runners; scenarios "language runner registered when its toolchain is on PATH" and "missing toolchain degrades cleanly"; error rows for a missing toolchain, SAFE-1 deny, empty argv, a vanished binary and timeout / abort; dependencies; files list gains `plugins/runners/*.ts` and `tests/runners.plugins.test.ts`.
- `specs/plugins/testing.md` / `tasks.md`: runner test coverage and task line.
- `specs/cli/cli.spec.md` / `specs/cli/testing.md`: the `plugins list` invariant names the runner status lines; change log and test line.
- `docs/DISCORD-GO-LIVE.md`: the dangerous-tools table lists `node-exec` / `python-exec` / `cargo-exec` (registered only when the toolchain is on PATH).
- No CHANGELOG / STATUS / package version edit: the release PR adds the bullet.
