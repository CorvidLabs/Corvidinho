---
module: cli
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
---

# Delta — cli (clean CLI errors)

## Added

### REQUIREMENT REQ-cli-419

A failing CLI command SHALL print one plain-language error line and a hint and
exit non-zero, never a stack trace, a code frame, a library object dump or
Bun's crash footer (CLI-4), and SHALL keep the single-JSON-result shape under
`--json` (CLI-7). The line SHALL NOT contain a secret (SAFE-6).

- `runCli(argv)` SHALL wrap `main` as the top-level error boundary (the
  `import.meta.main` entry uses it): anything `main` throws SHALL go to
  `reportCliError`, whose return value is the exit code.
- `reportCliError(err, { json })` SHALL print `corvidinho: <line>` then
  `hint: <hint>` on stderr. In JSON mode (`--json` or `--output json`
  before `--`) it SHALL print `{ "ok": false, "error": <line> }` on stdout,
  the `plugins run --json` error shape, and the hint on stderr. `<line>` is
  `formatErrorLine(err)` (REQ-discord-417). The exit code SHALL be the
  error's own integer `exitCode` in 1..255, else 1, so existing codes hold
  (`PluginNotFoundError` stays 1).
- The hint SHALL match the error: an unknown plugin names
  `corvidinho plugins list`; a filesystem error with a path names
  `CORVIDINHO_DATA_DIR` and its default `~/.local/share/corvidinho`; anything
  else names `corvidinho doctor`.
- `plugins run` SHALL catch an unknown name (including `fledge-*`) or a
  plugin handler that throws and report it through `reportCliError` (text
  and `--json`). A plugin result with `ok: false` keeps its existing output
  and exit code.
- `discord register-commands` SHALL report a failed registration as one line,
  `[discord] register-commands failed (<status>): <line>`, adding
  `— check DISCORD_TOKEN / DISCORD_BOT_TOKEN and --guild-id` on 401/403, and
  exit 1.
- `github watch` SHALL stop the poller and exit with `fatal.exitCode` (1)
  when WATCH halts on a GitHub 401 (REQ-watch-418). SIGINT/SIGTERM still stop
  it with exit 0.

No global `unhandledRejection` handler, env var, flag or command is added.

Acceptance Criteria
- `plugins run nosuchplugin` and `plugins run fledge-nosuch` exit 1 with `corvidinho: Unknown plugin command: <name>` and a `corvidinho plugins list` hint; with `--json`, stdout is `{ok:false,error:"Unknown plugin command: nosuchplugin"}`.
- `CORVIDINHO_DATA_DIR=/proc/nope CORVIDINHO_ACTING_DISCORD_USER_ID=1 plugins run memory-recall` exits 1 with exactly two stderr lines, the error naming `/proc/nope` and a hint naming `CORVIDINHO_DATA_DIR`; with `--json` stdout is `{ok:false,error}`.
- `CORVIDINHO_DATA_DIR=/proc/nope … discord bridge` exits 1 with `corvidinho: <line>` and the data-dir hint.
- `discord register-commands --guild-id 1` with a token Discord rejects (401) exits 1 with one stderr line `[discord] register-commands failed (401): …` naming `DISCORD_TOKEN`.
- `github watch` with a token GitHub rejects (401) exits 1 by itself.
- None of these outputs contains a stack frame, a code frame, Bun's crash footer, `node_modules`, `rawError`, `requestBody` or the token value.
- `runCli` returns a thrown error's `exitCode` (or 1) and passes a normal exit code through unchanged.
