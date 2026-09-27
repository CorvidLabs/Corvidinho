---
module: cli
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
---

# Delta — cli (`plugins list` shows the PLUGIN-4 language runner status)

## Modified

### REQUIREMENT REQ-cli-112

`corvidinho plugins list` SHALL load the project's Fledge plugins (cwd =
current directory) before listing (FLEDGE-4 / PLUGIN-6). The text view SHALL
show for each command its danger marking, minimum tier, origin when not
builtin, and approximate schema tokens, followed by the tool schema cost
summary (total vs budget, per-origin subtotals, largest, oversized) and a
Fledge status line (plugins/commands registered, or why none loaded, plus
skipped names and warnings). `plugins list --json` SHALL stay a JSON array of
entries, each adding `origin`, `schemaChars` and `approxTokens`. When fledge is
missing or fails, the command SHALL still list builtins and exit 0.
`corvidinho plugins run fledge-<command>` SHALL discover Fledge plugins only
when that name is not already registered, then run it under SAFE-1.

Before the Fledge status line the text view SHALL print the PLUGIN-4 language
runner status: `Language runners (PLUGIN-4): <name> (<binary>), …` for the
runners that loaded (or `none loaded`), then one `<name> not loaded:
<tool> not found on PATH` line per runner whose toolchain is missing
(REQ-plugins-314). A missing toolchain SHALL NOT change the exit code (0).

Acceptance Criteria
- With a fake fledge on PATH, `plugins list` shows `fledge-hello  [dangerous, tier>=2, fledge:fledge-plugin-hello@0.2.0]  ~N tok`, the cost summary and `Fledge plugins: 1 plugin(s), 1 command(s) registered`.
- `plugins list --json` is an array; `fledge-hello` has dangerous=true, minTier=2, origin, schemaChars, approxTokens; builtins have origin `builtin`.
- Without fledge on PATH, builtins list, `Fledge plugins: none loaded (fledge not on PATH)` prints, exit 0.
- `--non-interactive plugins run fledge-hello` exits 2 (SAFE-1) unless `CORVIDINHO_ALLOWLIST=fledge-hello`, which runs it in the project root.
- With no node, python3/python or cargo on PATH, `plugins list` exits 0, still lists `shell-exec`, prints `Language runners (PLUGIN-4): none loaded` and `node-exec not loaded: node not found on PATH` / `cargo-exec not loaded: cargo not found on PATH`, and lists no runner command.
- With only `cargo` on PATH, `plugins list` lists `cargo-exec  [dangerous, tier>=2]`, prints `cargo-exec (<path to cargo>)` on the runner line and names `node-exec` as not loaded.
