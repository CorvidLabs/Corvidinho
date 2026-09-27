---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: research
---

# Research

- `Bun.which(cmd, { PATH })` (Bun 1.4.2): an explicit `PATH: ""` or a dir
  without the binary returns null; `PATH: undefined` falls back to the
  process PATH, so the resolver always passes a string. A relative entry is
  resolved against the process cwd, which is why only absolute entries are kept.
- `Bun.spawn` of a missing absolute path throws synchronously (ENOENT);
  `spawnCapped` already catches that into `spawnError` with code 127.
- `runPlugin` (`src/plugins/run.ts`) rethrows handler exceptions and records
  SAFE-5 rows for dangerous commands; returning a result keeps the audit row
  `error` with the exit code.
- `buildOpenAiTools` already drops dangerous tools unless `includeDangerous`,
  mutating tools for non-ADMIN, and tools above the tier; `dangerous: true`
  makes a runner mutating (`isMutatingPlugin`). `task run` does not offer
  dangerous tools to the model yet (docs/DISCORD-GO-LIVE.md), so today the
  runners are reachable through `corvidinho plugins run` and any catalog built
  with dangerous tools.
- The box has `/opt/node22/bin/node`, `/usr/local/bin/python3` and
  `/root/.cargo/bin/cargo`; with PATH=/usr/bin:/bin only `python-exec` loads
  (`/usr/bin/python3`) and `plugins list` reports node and cargo missing.
- Out of reach of this slice (leftover risk, SAFE-3 remainder in the scoping
  record): a runner executes arbitrary code, so in-language `chdir`
  (`process.chdir`, `os.chdir`) or `cargo --manifest-path` can act outside
  the root, as `python3 -c` / `node -e` already can through `shell-exec`.
  The gating is dangerous + allowlist + minTier 2 + ADMIN only.
