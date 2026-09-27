---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: design
---

# Design

- `plugins/runners/commands.ts`: `RUNNERS` (`node-exec` → `node`;
  `python-exec` → `python3`, then `python`; `cargo-exec` → `cargo`),
  `runnerCommand(spec, bin)` → `PluginCommand` with `dangerous: true`,
  `minTier: 2` and a short description (tool-catalog cost, FLEDGE-5), and
  `runRunner`, which spawns `[bin, ...args]` through the existing
  `spawnCapped` (`plugins/fledge/spawn.ts`: argv array, stdin closed, own
  process group, timeout / abort kill the tree, per-stream caps, spawn failure
  returned as `spawnError` instead of thrown). Result mapping follows
  `runFledgeCommand`: spawn error → exit 127, timeout → 124, abort → 130,
  non-zero → that code, output scrubbed with `scrubSecrets`. Empty argv is a
  usage error before spawning.
- Child env: `runnerChildEnv` = `buildVerifyEnv` (`src/agent/verify.ts`; the
  verify lane's scrub — model-written code is the same threat as tests the
  agent wrote) minus `CDPATH` / `OLDPWD` (as `shell-exec`), plus
  `CORVIDINHO_PROJECT_ROOT`. `plugins/fledge/spawn.ts` is reused unchanged.
- Timeout: fixed `RUNNER_TIMEOUT_MS` = 10 minutes (a cold `cargo build`
  exceeds Fledge's 120 s); output cap 64 KiB per stream like Fledge. No env
  knob.
- `plugins/runners/index.ts`: `resolveRunnerBin(spec, env)` runs `Bun.which`
  over the absolute PATH entries only (a relative entry such as `.` would let
  the project choose the binary), one entry at a time, skipping a hit whose
  real path is the running Bun binary: `bun run` adds a `bun-node-*` dir with
  a `node` symlink to Bun when node is missing (and first under `--bun`), which
  is not the node toolchain. `loadRunnerPlugins(env = process.env)`
  registers a runner per toolchain found, is idempotent (a runner it already
  registered is kept and reported), and returns
  `{ loaded: [{name, tool, bin}], missing: [{name, tool, reason}] }`.
  `runnerStatusLines(report)` renders the `plugins list` lines, like
  `fledgeStatusLines`.
- `src/plugins/builtins.ts` calls `loadRunnerPlugins()` after
  `loadShellPlugins()`. `src/cli.ts` `pluginsList` calls it again (idempotent)
  for the report and prepends `runnerStatusLines` to the Fledge notes;
  `--json` output is unchanged (loaded runners appear as entries).
- PATH is resolved when the builtins load (once per process, or again after a
  registry clear); a toolchain installed later needs a restart.
