---
module: cli
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
---

# Delta — cli (plugins list cost view + Fledge run #112)

## Added

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

Acceptance Criteria
- With a fake fledge on PATH, `plugins list` shows `fledge-hello  [dangerous, tier>=2, fledge:fledge-plugin-hello@0.2.0]  ~N tok`, the cost summary and `Fledge plugins: 1 plugin(s), 1 command(s) registered`.
- `plugins list --json` is an array; `fledge-hello` has dangerous=true, minTier=2, origin, schemaChars, approxTokens; builtins have origin `builtin`.
- Without fledge on PATH, builtins list, `Fledge plugins: none loaded (fledge not on PATH)` prints, exit 0.
- `--non-interactive plugins run fledge-hello` exits 2 (SAFE-1) unless `CORVIDINHO_ALLOWLIST=fledge-hello`, which runs it in the project root.
