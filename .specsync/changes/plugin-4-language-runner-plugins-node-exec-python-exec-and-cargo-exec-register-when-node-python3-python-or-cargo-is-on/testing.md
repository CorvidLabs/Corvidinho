---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: testing
---

# Testing

Fail on `main`, pass on the branch:

- Full `main` source (no `plugins/runners/`, `main`'s `src/plugins/builtins.ts`
  and `src/cli.ts`): `bun test tests/runners.plugins.test.ts` fails to load
  (`Cannot find module '../plugins/runners/index.ts'`), 0 pass / 1 fail.
- Runner module present but `main`'s `src/plugins/builtins.ts` and
  `src/cli.ts` (the wiring): 17 pass / 3 fail — builtins never register
  `node-exec`, and `plugins list` prints no `Language runners` line and no
  `cargo-exec` with `cargo` on PATH.
- Branch: 20 pass / 0 fail (the three real-toolchain smoke tests ran here:
  node, python3 and cargo are installed).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-313` (registration, danger / tier) | `tests/runners.plugins.test.ts` | stub `node` / `python3` / `cargo` on PATH register `node-exec` / `python-exec` / `cargo-exec` with dangerous=true, mutating=true, minTier=2 bound to the stub path; a second load keeps the same command objects. |
| `REQ-plugins-313` (resolution) | `tests/runners.plugins.test.ts` | `python3` wins over `python`, `python` alone is used; a stub reachable only through a relative PATH entry (or `.`) resolves to null. |
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
- `bun test` — 1724 passed, 2 skipped, 0 failed (139 files).
- `bun test tests/runners.plugins.test.ts` — 20 passed.
- `specsync check --require-coverage 100`, `specsync change audit` and `fledge lanes run verify --non-interactive` — green.
