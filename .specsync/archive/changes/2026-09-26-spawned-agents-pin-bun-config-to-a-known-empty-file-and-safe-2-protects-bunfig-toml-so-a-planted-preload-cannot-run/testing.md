---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-133` | `tests/spawn.argv.test.ts` | `.ts` argv is `bun --no-env-file --config=/dev/null <bin>`; a `bunfig.toml` preload in the spawn cwd does not run in the child and the child's env token is not printed (failed on main with `PRELOAD RAN token=fake-token-123`). |
| `REQ-agent-133` | `tests/autonomous.delegate.test.ts` | delegate worker argv starts `bun --no-env-file --config=/dev/null <bin>`. |
| `REQ-plugins-083` | `tests/files.plugins.test.ts` | `isProtectedPath` is true for `bunfig.toml`, `sub/pkg/bunfig.toml`, `.bunfig.toml` and mixed case; files-write of `bunfig.toml`, `.bunfig.toml`, `sub/bunfig.toml` is refused (exit 2, SAFE-2) and no file is created (failed on main). |
