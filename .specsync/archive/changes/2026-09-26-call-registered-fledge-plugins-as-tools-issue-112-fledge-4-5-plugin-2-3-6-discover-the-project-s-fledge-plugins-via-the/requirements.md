---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: requirements
---

# Requirements

### REQ-plugins-112

The system SHALL discover the Fledge plugins registered for a project through
the local fledge CLI (FLEDGE-4 / PLUGIN-3): it SHALL run
`fledge --non-interactive plugins list --json` (required) and
`fledge --non-interactive plugins audit --json` (capabilities, best effort) as
argv arrays with cwd set to the project root, stdin closed, a timeout and a
capped output size, never through a shell. Fledge output SHALL be treated as
data: command names SHALL match `^[A-Za-z0-9][A-Za-z0-9_-]{0,56}$` or be
skipped with a warning, and free text SHALL be cleaned of control characters
and length-capped. Each valid Fledge command SHALL register as the typed
plugin `fledge-<command>` with `dangerous: true` (fledge manifests declare no
danger or tier and native plugins run unsandboxed, so SAFE-1 consent applies)
and `minTier` 2 (code) for native or capability-unknown plugins, or 1 (tool)
for a wasm-sandboxed plugin without the `exec` capability (PLUGIN-2). The
command description SHALL stay small and SHALL NOT include the plugin source
path (FLEDGE-5). A name already registered by a builtin or another plugin
SHALL be skipped with a reason. A missing fledge binary, non-zero exit,
unexpected JSON, oversized output or timeout SHALL degrade to zero Fledge
commands with a reason and SHALL NOT affect builtins.

Acceptance Criteria
- Fake fledge fixture: list + audit rows register `fledge-hello`, `fledge-bye`, `fledge-tz`, `fledge-runner`, all dangerous; native → minTier 2, wasm without exec → 1, wasm with exec → 2, audit unavailable → 2.
- Invalid or overlong command names are skipped with a warning; duplicate names across plugins are skipped with a reason.
- Missing fledge, exit 3, bad JSON and a 200 ms timeout each return ok=false with a reason and leave the builtin list unchanged.
- The description names the plugin, version, trust tier and sandbox and never the source path.

### REQ-plugins-113

Running `fledge-<command>` SHALL execute
`fledge --non-interactive plugins run <command> <argv...>` as an argv array
(no shell interpolation) with cwd pinned to the plugin cwd (project root /
task worktree), stdin closed, and a child env that drops `CORVIDINHO_*`,
`DISCORD_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`,
keeps the rest (including GitHub tokens for GitHub-backed Fledge plugins), and
sets `FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`. Output SHALL be
secret-scrubbed with `scrubSecrets` (SAFE-6) and capped per stream; a run
SHALL time out (default 120 s) and be killed with exit 124; a non-zero exit
SHALL be a failed result carrying that exit code; a binary that cannot start
SHALL fail with exit 127 instead of throwing. SAFE-1 SHALL deny the command in
non-interactive mode unless `fledge-<command>` is allowlisted, and SAFE-5
audit rows SHALL be recorded as for any dangerous plugin.

Acceptance Criteria
- Non-interactive without allowlist → exit 2 with SAFE-1; allowlisted → fake fledge sees `plugins run hello` and each argv item verbatim (spaces, `$(…)`, `;` not interpreted), cwd = project root.
- The child env lacks Discord / Corvidinho LLM / audit keys, keeps `GITHUB_TOKEN`, and has `FLEDGE_NON_INTERACTIVE=1`.
- Exit 7 → ok=false exitCode 7; sleep past a 200 ms timeout → exitCode 124; missing binary → 127.
- A `ghp_…` token in plugin output is redacted and output past the cap is truncated with a marker.

### REQ-plugins-114

The system SHALL measure the context cost of each loaded plugin command on the
exact tool definition sent to the model (`toolDefForEntry`), as JSON
characters and approximate tokens (chars/4), and SHALL report the loaded tool
surface as a whole (FLEDGE-5 / PLUGIN-6): total approximate tokens if every
loaded command were offered, a default budget of ~8000 tokens with an
over-budget flag, subtotals by origin (`builtin` or
`fledge:<plugin>@<version>`), the largest schemas, and commands whose schema
exceeds a ~250-token soft cap. `PluginCommand` MAY carry an `origin`; the
registry `list()` shape is unchanged.

Acceptance Criteria
- `withToolCost` adds `origin`, `schemaChars`, `approxTokens` (= ceil(schemaChars/4)) per entry.
- `toolSurfaceReport` totals match the per-entry sum, group by origin, and flag over-budget / oversized with small test budgets.
- The text view prints per-command `~N tok`, the total vs budget with `OVER BUDGET` when exceeded, per-origin subtotals and oversized names.

### REQ-cli-112

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

### REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged.

Acceptance Criteria
- includeDangerous + code tier + allowlist: the first request offers `fledge-hello`; the model's call runs the fake fledge and the ToolResult succeeds with the plugin output.
- Default catalog: no `fledge-*` tool is offered and none is registered.
- Existing tool-loop tests pass unchanged.
