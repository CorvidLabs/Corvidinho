# Lesson bundle — plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root)
- **Kind**: Feature
- **Specs**: plugins, cli
- **Paths**: plugins/runners/index.ts, plugins/runners/commands.ts, src/plugins/builtins.ts, src/cli.ts, tests/runners.plugins.test.ts, docs/DISCORD-GO-LIVE.md
- **Acceptance**: When node, python3 (else python) or cargo resolves on an absolute PATH entry at builtin load, plugins list and the code-tier tool catalog show node-exec, python-exec and cargo-exec, each dangerous=true and minTier=2 (SAFE-1 non-interactive deny unless allowlisted; not offered to non-ADMIN role sessions, below code tier or without dangerous tools); each runs its toolchain's absolute binary with the model's argv verbatim (no shell, no expansion, flags kept) with cwd pinned to the plugin cwd, the verify lane's scrubbed env without CDPATH/OLDPWD, a timeout, per-stream output caps and process-tree kill on the calling run's abort (exit 130) or timeout (exit 124); a non-zero exit is ok:false with that code; when a toolchain is missing its runner is not registered or offered, plugins list still exits 0 and prints a line naming each missing tool, other builtins (shell-exec, files-*) are unaffected, and a registered binary that disappears returns exit 127 instead of throwing; no new slash command, env var or config key

## Evidence

- Verification commit: `095c9e9dc256221e75696be90ede084141cd2e83`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

PLUGIN-4 (captured in `hi/plugin.md`, no retire line): "Language runners I care
about on Linux (at least shell plus node/python/cargo when present) show up as
plugins that degrade cleanly when the toolchain is missing." Issue #83.

Gap on `main` (fc0ed8d): the shell part is met (`shell-exec`,
REQ-plugins-086..088). No plugin exists for node, python or cargo:
`src/plugins/builtins.ts` registers only autonomous, discord, files, git,
github, memory, meta, search, shell, specsync and web, so `plugins list` shows
no runner even with all three installed, and nothing reports a missing
toolchain. The Fledge bridge (PLUGIN-3) offers no language-runner plugin
either. `runPlugin` rethrows handler exceptions, so a naive `Bun.spawn` of a
missing binary would throw out of the run.

Constraints: HI-first — only PLUGIN-4 plus the already-captured PLUGIN-2 /
SAFE-1 / SAFE-3 apply; no new slash command, env var or config key; no schema
change; `plugins/shell/clamp.ts` is being changed by another PR and is not
touched. Runners execute code, so they must be dangerous and at least as
restricted as `shell-exec` (cwd pinned to the project root, minTier code).

## From the change's design.md

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

## From the change's testing.md

# Testing

Fail on `main`, pass on the branch:

- Full `main` source (no `plugins/runners/`, `main`'s `src/plugins/builtins.ts`
  and `src/cli.ts`): `bun test tests/runners.plugins.test.ts` fails to load
  (`Cannot find module '../plugins/runners/index.ts'`), 0 pass / 1 fail.
- Runner module present but `main`'s `src/plugins/builtins.ts` and
  `src/cli.ts` (the wiring): 17 pass / 3 fail — builtins never register
  `node-exec`, and `plugins list` prints no `Language runners` line and no
  `cargo-exec` with `cargo` on PATH.
- Branch: 22 pass / 0 fail (the three real-toolchain smoke tests ran here:
  node, python3 and cargo are installed). The two Bun node shim cases were
  added in review; they fail (20 pass / 2 fail) with the resolver that took
  Bun's `node` shim.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-313` (registration, danger / tier) | `tests/runners.plugins.test.ts` | stub `node` / `python3` / `cargo` on PATH register `node-exec` / `python-exec` / `cargo-exec` with dangerous=true, mutating=true, minTier=2 bound to the stub path; a second load keeps the same command objects. |
| `REQ-plugins-313` (resolution) | `tests/runners.plugins.test.ts` | `python3` wins over `python`, `python` alone is used; a stub reachable only through a relative PATH entry (or `.`) resolves to null. |
| `REQ-plugins-313` (Bun's node shim) | `tests/runners.plugins.test.ts` | a `node` symlink to the running Bun binary resolves to null alone and to the real stub `node` later on PATH; loading with only it reports `node-exec not loaded: node not found on PATH`; `bun run corvidinho plugins list` with no node on PATH (Bun adds its `bun-node-*` shim) lists no `node-exec` row and prints that line. Both cases fail with the pre-review resolver (node-exec bound to the shim). |
| `REQ-plugins-313` (argv verbatim, cwd pinned, exit codes) | `tests/runners.plugins.test.ts` | `python-exec` argv `` -c x $(id) --json "a b" * -- `id` `` arrives as exactly those 8 words, cwd = the project root; stub exit 3 → ok=false, exitCode 3; empty argv → exit 1 usage error, stub never ran. |
| `REQ-plugins-313` (scrubbed env) | `tests/runners.plugins.test.ts` | with `GITHUB_TOKEN`, `DISCORD_TOKEN`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_DISCORD_USER_ID`, `CDPATH` and `OLDPWD` set, the stub sees none of them and `CORVIDINHO_PROJECT_ROOT` = the project root. |
| `REQ-plugins-313` (SAFE-1, catalog) | `tests/runners.plugins.test.ts` | non-interactive with an empty allowlist each runner returns exit 2 with SAFE-1 and the stub never ran; allowlisted `node-exec` runs; `buildOpenAiTools` offers all three only at code tier with dangerous tools for ADMIN. |
| `REQ-plugins-313` (abort / timeout) | `tests/runners.plugins.test.ts` | aborting the calling run returns exit 130 (`aborted: true`) and the stub's background `sleep` is gone; a 1 s timeout returns exit 124 and kills the tree. |
| `REQ-plugins-313` (real toolchains) | `tests/runners.plugins.test.ts` | `node-exec -e 'console.log(process.cwd())'` and `python-exec -c 'import os; print(os.getcwd())'` print the project root; `cargo-exec --version` prints `cargo N…` (each skipped where the toolchain is missing). |
| `REQ-plugins-314` (missing toolchain) | `tests/runners.plugins.test.ts` | empty PATH and no PATH register nothing; the report lists all three missing; `runnerStatusLines` prints `none loaded` and `node-exec not loaded: node not found on PATH` / `python-exec not loaded: python3 / python not found on PATH` / `cargo-exec not loaded: cargo not found on PATH`; the code-tier catalog has no runner; only `python3` on PATH loads only `python-exec`. |
| `REQ-plugins-314` (other builtins unaffected) | `tests/runners.plugins.test.ts` | `loadBuiltins()` with an empty PATH registers `shell-exec`, `files-read`, `files-write`, `files-list` and no runner; with only `node` it adds `node-exec` alone. |
| `REQ-plugins-314` (`plugins list`) | `tests/runners.plugins.test.ts` | CLI spawn with PATH = an empty dir exits 0, lists `shell-exec`, prints the `none loaded` and `not loaded` lines and no runner row; with only `cargo` it lists `cargo-exec  [dangerous, tier>=2]` and `cargo-exec (<bin>)`. |
| `REQ-cli-112` (`plugins list` runner status) | `tests/runners.plugins.test.ts`, `tests/fledge.cli.test.ts`, `tests/plugins.list.smoke.test.ts` | the two CLI-spawn cases above (none loaded / only `cargo`); the existing Fledge line, cost summary and `--json` array assertions still pass. |
| `REQ-plugins-314` (vanished binary) | `tests/runners.plugins.test.ts` | after deleting the registered stub, `runPlugin('node-exec')` resolves ok=false, exit 127, `node-exec: node could not start`; a command bound to a nonexistent binary returns 127 too. |
| `REQ-plugins-086..088`, FLEDGE-5 / PLUGIN-6 list | `tests/shell.plugins.test.ts`, `tests/plugins.list.smoke.test.ts`, `tests/fledge.cli.test.ts`, `tests/docs.operator-facts.test.ts` | unchanged and passing. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1726 passed, 2 skipped, 0 failed (139 files).
- `bun test tests/runners.plugins.test.ts` — 22 passed.
- `specsync check --require-coverage 100`, `specsync change audit` and `fledge lanes run verify --non-interactive` — green.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
