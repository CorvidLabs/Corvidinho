# Lesson bundle — call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list
- **Kind**: Feature
- **Specs**: plugins, cli, agent
- **Paths**: plugins/fledge, src/plugins/toolCost.ts, src/plugins/types.ts, src/plugins/registry.ts, src/agent/tools.ts, src/agent/execute.ts, src/cli.ts, tests/fledge.plugins.test.ts, tests/fledge.cli.test.ts, specs/plugins, specs/cli, specs/agent
- **Acceptance**: corvidinho discovers the project's installed Fledge plugins by running fledge plugins list/audit --json with cwd set to the project root, argv arrays and a timeout; each Fledge plugin command registers as typed plugin fledge-<command> with dangerous true and minTier 2 (native) or 1 (sandboxed wasm without exec); plugins run fledge-<command> executes fledge --non-interactive plugins run <command> <argv...> in the project root with no shell, stdin closed, a scrubbed env, capped and secret-scrubbed output and a timeout; SAFE-1 denies them in non-interactive mode unless allowlisted; missing fledge, non-zero exit, bad JSON or timeout during discovery degrade to zero Fledge commands with a reason and never break builtins; plugins list shows each command's origin and approximate tool-schema tokens plus a total against a tool-surface budget with over-budget and oversized-schema warnings, and plugins list --json stays an array with origin/schemaChars/approxTokens per entry; fixture tests use a fake fledge on PATH with no network

## Evidence

- Verification commit: `e0f71dbb6bae084ea69e225db1c64ecb30cbcf34`
- Base commit: `8747a9abb99c2322ea67c40da96fb60bc69172bc`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #112 (M6, build step 5): let Corvidinho call any Fledge plugin registered
for the project as a tool. Captured HI: `hi/fledge.md` FLEDGE-4 (discover and
call registered Fledge plugins, including ones I author), FLEDGE-5 (schemas
small; see when the tool surface blows the context budget), `hi/plugin.md`
PLUGIN-2 (danger + tier declared and enforced), PLUGIN-3 (add a project or
third-party Fledge plugin without a Corvidinho release), PLUGIN-6 (list what is
loaded with enough schema detail to see why context got expensive), plus
`hi/safe.md` SAFE-1/5/6.

Fledge 1.8.0 facts (read from the installed CLI and its crate source, not
assumed): plugins live in a per-user registry (`~/.config/fledge/plugins.toml`);
`fledge plugins list --json` returns `{schema_version: 1, plugins: [{name,
version, source, installed, commands[], pinned_ref, trust_tier, runtime}]}`;
`fledge plugins audit --json` adds `capabilities {exec, store, metadata,
filesystem, network}`; `fledge plugins run <command> [args...]` takes trailing
args verbatim (`allow_hyphen_values`) and hosts the fledge-v1 JSON-lines
protocol itself; `--non-interactive` is a global flag. The manifest has no
danger or tier field, and only wasm plugins are sandboxed.

Out of this slice (not captured HI): a `/status` context-budget line in
Discord, a separate per-project Fledge allowlist beyond `CORVIDINHO_ALLOWLIST`,
and offering allowlisted dangerous tools in the default catalog (agent
REQ-agent-009 keeps dangerous tools out by default).

## From the change's design.md

# Design

- `plugins/fledge/spawn.ts` — `spawnCapped` (argv array, stdin ignored, SIGKILL
  on timeout, reader cancel after a short grace so a grandchild holding the
  pipe cannot hang us, per-stream byte cap) and `fledgeChildEnv` (drop
  Corvidinho/Discord/LLM secrets, set `FLEDGE_NON_INTERACTIVE=1` and
  `CORVIDINHO_PROJECT_ROOT`).
- `plugins/fledge/discover.ts` — list (required) + audit (best effort) in
  parallel; validate names; clean text; every failure → `ok:false` + reason.
- `plugins/fledge/commands.ts` — `fledge-<command>` PluginCommand:
  `dangerous: true` always (no danger field exists in fledge manifests; native
  plugins are unsandboxed binaries, so Corvidinho cannot tell read-only from
  destructive); `minTier` 2 unless wasm-sandboxed without `exec` (1). Small
  description without source path. Output scrubbed + capped; timeout → 124.
- `plugins/fledge/index.ts` — async `loadFledgePlugins` (per-cwd cache that is
  re-validated against the registry), collision skip with reason, status lines.
- `src/plugins/toolCost.ts` — cost on `toolDefForEntry` JSON, chars/4 tokens,
  report (total vs 8000 budget, by origin, largest, >250 oversized), text view.
- Small hooks only: `src/cli.ts` (`plugins list` / lazy `plugins run fledge-*`),
  `src/agent/execute.ts` (discover only when `includeDangerous`),
  `src/agent/tools.ts` (extract `toolDefForEntry`), `src/plugins/types.ts`
  (optional `origin`). Registry `list()` shape unchanged. No schema/DB change;
  nothing new is persisted.

## From the change's testing.md

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-112 | `tests/fledge.plugins.test.ts` discovery parse, invalid names, degrade (missing / exit 3 / bad JSON / timeout), audit unavailable, registration markings, collisions, description |
| REQ-plugins-113 | `tests/fledge.plugins.test.ts` SAFE-1 deny, allowlisted argv/cwd/env, exit 7, timeout 124, missing binary 127, scrub + cap, child env |
| REQ-plugins-114 | `tests/fledge.plugins.test.ts` cost per entry, report totals/origins, over-budget + oversized text |
| REQ-cli-112 | `tests/fledge.cli.test.ts` list text/json with fake fledge, no-fledge degrade, run deny/allow, unknown name |
| REQ-agent-112 | `tests/fledge.plugins.test.ts` tool loop offers + runs `fledge-hello` with includeDangerous; default catalog never discovers; `tests/agent.tool-loop.test.ts` unchanged |

All fixtures use a fake `fledge` shell script on a temp PATH — no network, no
real plugins, no tokens. Commands: `bun test tests/fledge.plugins.test.ts
tests/fledge.cli.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
- `specs/agent/context.md`
