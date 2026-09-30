# Lesson bundle — i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10)
- **Kind**: Feature
- **Specs**: agent, cli, discord, watch
- **Paths**: .env.example, AGENTS.md, README.md, docs/DAEMON.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, src/agent/execute.ts, src/agent/index.ts, src/agent/spend.ts, src/agent/tier.ts, src/cli.ts, src/daemon/daemon.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/status.ts, src/doctor.ts, src/store/scrub.ts, src/version.ts, src/watch/poller.ts, tests/agent.cli.test.ts, tests/agent.events-ndjson.test.ts, tests/agent.execute.test.ts, tests/agent.ndjson-spawn.test.ts, tests/agent.persona.test.ts, tests/agent.project-instructions.test.ts, tests/agent.tool-loop.test.ts, tests/agent.verify-gate.test.ts, tests/autonomous.council.test.ts, tests/autonomous.enabled.test.ts, tests/cli.doctor-truth.test.ts, tests/cli.plugins-run-argv.test.ts, tests/cli.project-path.test.ts, tests/discord.ask-ping.test.ts, tests/discord.inflight-replies.test.ts, tests/discord.rich-replies.test.ts, tests/discord.slash-ask7.test.ts, tests/discord.slash.test.ts, tests/discord.spend.test.ts, tests/discord.thinking-bridge.test.ts, tests/fixtures/preload-probe.ts, tests/fledge.core.test.ts, tests/fledge.plugins.test.ts, tests/preload.operator-data-dir.test.ts, tests/preload.ts, tests/safe.injection.test.ts, tests/version.test.ts, src/agent/providers.ts, tests/agent.providers.test.ts, tests/fixtures/fake-llm.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md
- **Acceptance**: AGENT-13 (partial: the headless agent CLI kind is providers-2) and AGENT-10 (both already captured on main from Leif's 2026-09-28 interview) hold: CORVIDINHO_LLM_MODEL and the per-tier CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE take comma lists of kind:model entries (openai, ollama, anthropic; a bare or unknown prefix is OpenAI-compatible) and only the first entry of a tier is called for now; openai uses CORVIDINHO_LLM_BASE_URL (vendor default https://api.openai.com/v1) with CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, ollama uses OLLAMA_HOST (default 127.0.0.1:11434) with no key and no authorization header, anthropic uses https://api.anthropic.com/v1 with ANTHROPIC_API_KEY, all through the one OpenAI-compatible chat transport and the SAFE-8 guard; there is no built-in default model (gpt-4o-mini removed) and no demo stub: with no usable provider for a run's tier (nothing set, or the kind's key missing) the attempt calls nothing and runTask ends failed with the no-provider notice as its summary on every surface; the notice appears at startup (bridge console warn, daemon llm.no_provider warn plus an llm field on daemon.started, the WATCH poller outside dry runs, task run stderr), in /status (the owner sees the setting names; anyone else sees only that no provider is configured, like the owner-only spend line) and in doctor/init ([warn] llm); ANTHROPIC_API_KEY joins the SAFE-6 secret env scrub (it was already dropped from the verify lane and shells); the bun test preload clears the operator's model config and provider keys; tests that relied on the demo stub or the default model run against a fake provider; tests/agent.providers.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `7d7ed80118d35ec4485279c3d3605418909875da`
- Base commit: `156cfa975c6d269b7e3a183cef3c7fdb20cab4f9`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #79 (M3 "Real dev teammate"), slice providers-1 of the M3/M4 plan.
AGENT-13 ("I configure its models (OpenAI-compatible, Ollama, Anthropic or a
headless agent CLI), and there's no built-in default.") and AGENT-10 ("With no
provider set, it says so at startup and in /status.") were confirmed by Leif
in the 2026-09-28 interview (round 2: "capture all four" provider criteria)
and are already captured in `hi/agent.md` on main, so this change captures
nothing new. It builds AGENT-10 and AGENT-13 without the headless agent CLI
kind (providers-2, waiting on a Leif decision), so AGENT-13 stays partial.

What was wrong on main (156cfa9):

- `src/agent/tier.ts` had `DEFAULT_LLM_MODEL = "gpt-4o-mini"`, and
  `modelForTier` fell back to it (REQ-agent-007 / REQ-agent-079 required it).
- With no `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`, `createTaskExecute`
  answered from `demoExecute` ("demo task attempt N"), so a Discord or WATCH
  run with no provider replied with stub text, and `/status` said "LLM: demo
  stub". Nothing at startup (bridge, `github watch`, daemon, `task run`)
  said no provider was set.
- An entry could not name its provider: Ollama and Anthropic were reachable
  only by pointing `CORVIDINHO_LLM_BASE_URL` at them, and still needed a key
  (a keyless Ollama config read as "demo stub").
- `ANTHROPIC_API_KEY` was dropped from the verify lane and the shell but not
  in the SAFE-6 secret env names.

Constraints: specs only through SpecSync; the chain / fallback (AGENT-11,
providers-3), the idle timeout and turn cap (AGENT-12, providers-4) and the
`cli:` kind (providers-2) are later slices; #316 (approvals, schema v14)
and #317 (owner-only /status spend) stay as they are; `src/plugins/run.ts`
and `src/plugins/must-ask.ts` are not touched (must-ask-gate builds in
parallel); #232/#233 scope untouched; v1 is off-chain; no schema version,
slash command, CLI flag or /admin knob; CHANGELOG is written at release time,
so the operator migration note is in docs/DISCORD-GO-LIVE.md E.9 and README.

## From the change's design.md

# Design

- **One module** `src/agent/providers.ts` (pure, env in → values out):
  `parseModelEntry` / `parseModelChain`, `modelChainForTier`,
  `resolveEntry` (kind → endpoint, key, `usable`), `ollamaHostUrl`,
  `providerId`, `providerForTier`, `entryLabel`, `defaultProviderLabel`,
  `providerNotice` / `NO_PROVIDER_NOTICE` and `providerStatus`.
  `tier.ts` keeps `TIER_MODEL_ENV`, `modelForTier`, `modelKeyForTier` and
  `perTierModels` (now over the parsed entries) and drops
  `DEFAULT_LLM_MODEL`. The two modules import each other only inside
  functions.
- **Transport unchanged.** `loadLlmEnv` returns the tier's first entry
  resolved (`kind`, `baseUrl`, `apiKey`, `model` without the prefix) plus
  `notice`. `chatCompletions` posts to `${baseUrl}/chat/completions` as
  before and sends `authorization` only when there is a key (Ollama). The
  SAFE-8 guard, `extractUsage`, the image retry and the per-request timeout
  are untouched.
- **No provider = failed run.** `createTaskExecute`'s attempt returns
  `{ error: true, summary: notice, filesChanged: [] }` before any fetch;
  `runTask` already ends a provider error `failed` (no retry, no verify).
  `demoExecute` is deleted; no env switch revives a stub (tests use a fake
  provider instead).
- **One notice everywhere.** `providerNotice(env, tiers)` groups tiers by
  problem ("CORVIDINHO_LLM_MODEL is not set" / "<entry> needs <KEY>, which
  is not set") and adds how to set a model when one is unset. Startup: the
  bridge (`console.warn` after the audit line), the WATCH poller (a log line,
  skipped in a dry run), the daemon (`llm` on `daemon.started` and an
  `llm.no_provider` warn), `task run` (first stderr line in text mode; the
  failed result in every mode). `/status`: `formatLlmStatusLine(env, {
  ownerView })`; the handler passes `isOwnerViewer` (already computed for the
  spend line), so setting names reach only the owner (SAFE-14.a pattern).
  `formatLlmStatusLine` without `ownerView` gives the non-owner line (fail
  closed). Doctor / init: `llmDoctorCheck` `[warn]` with the notice.
- **Chat replies unchanged.** A failed run's Discord reply (chat, button
  answers, `/session start`, `/work`, schedules) stays the usual
  `… failed (exit 1)` line; only `task run` output and the WATCH run-summary
  comment carry the run's summary. AGENT-10 asks for the notice at startup and
  in `/status`, and the notice's setting names are owner-only there, so the
  channel body is not changed here (pending Leif).
- **Spend.** `readSpendSnapshot` treats an empty model as nothing to price,
  and `unpricedTierModel` skips tiers with no model, so a missing model never
  reads as "paused for budget".
- **SAFE-6.** `ANTHROPIC_API_KEY` added to `SECRET_ENV_NAMES`; it was already
  in `VERIFY_ENV_DROP` (verify lane, runners, the SAFE-21 shell env).
- **Tests.** `tests/fixtures/fake-llm.ts`: `startFakeLlm` (a localhost
  OpenAI-compatible server configured as a keyless `ollama:` model, recording
  bodies and auth headers), `fakeLlmFetch` / `FAKE_LLM_ENV` for in-process
  runs, and `useConfiguredModel` for bridge tests whose footer reads the
  configured model. `tests/preload.ts` also clears the operator's model
  config and provider keys.
- **Rejected.** A test-only env switch that keeps the stub (a hidden built-in
  default); failing doctor on no provider (it never failed on no key before);
  hiding the model/host from non-owners (not asked; today's line shows it).

## From the change's testing.md

# Testing

Mock providers only: an injected `fetchImpl`, and a localhost
OpenAI-compatible `Bun.serve` fake (`tests/fixtures/fake-llm.ts`, a keyless
`ollama:` model) for spawned CLIs; dry-run bridge with a null gateway, the
daemon with an echo agent, a non-dry-run WATCH poller with an injected agent
and echo ack client, in-memory SQLite. No network, no real key.

Fail-on-base proof: with the base's (156cfa9) 13 modified source files
swapped in (`src/agent/{execute,index,spend,tier}.ts`, `src/cli.ts`,
`src/daemon/daemon.ts`, `src/discord/{agent-client,bridge}.ts`,
`src/discord/command-handlers/status.ts`, `src/doctor.ts`,
`src/store/scrub.ts`, `src/version.ts`, `src/watch/poller.ts`; the new
`src/agent/providers.ts` kept so imports resolve):
`bun test tests/agent.providers.test.ts` gave 3 pass, 15 fail (the three
passing are pure units of the new module: entry parsing, `resolveEntry`,
`ollamaHostUrl`); `tests/agent.execute.test.ts tests/agent.tool-loop.test.ts
tests/version.test.ts tests/cli.doctor-truth.test.ts tests/discord.slash.test.ts
tests/preload.operator-data-dir.test.ts tests/cli.plugins-run-argv.test.ts`
gave 69 pass, 10 fail (`agent.tool-loop` does not load: the base index has
no `NO_PROVIDER_NOTICE`); with the base `tests/preload.ts` too, the preload
hygiene case fails (the operator's model config reaches the suite). Restored:
all 134 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-179` | `tests/agent.providers.test.ts` ("model entries (AGENT-13)") | `kind:model` parsing (`ollama:qwen3:30b`, case-insensitive kinds, bare and unknown prefixes are openai, blanks and `ollama:` null); comma lists keep order; a tier key wins, a blank / `,` key falls back, nothing is `[]`; `modelForTier` "" when none; each kind's endpoint and key (openai base URL and key order, ollama keyless even with an OpenAI key, anthropic only its own key); `providerId` is the host; `OLLAMA_HOST` forms. |
| `REQ-agent-179` | `tests/agent.providers.test.ts` ("every kind goes through the one OpenAI-compatible transport") | Mock fetch: ollama → `http://gpu-box:9000/v1/chat/completions`, no authorization, `model` `qwen3:30b`; anthropic → `https://api.anthropic.com/v1/chat/completions`, `Bearer <ANTHROPIC_API_KEY>`; `openai:gpt-4.1, ollama:later` calls only the head at the base URL. Fail on base. |
| `REQ-agent-179` | `tests/agent.providers.test.ts` ("no built-in default …": notice, runTask, keyless ollama CLI, SAFE-6) | The notice text per case (unset, key only, anthropic without its key, only the read tier set, a run's own tier), never a key value; `runTask` ends `failed` with the notice, one attempt, no verify, no fetch; the real `task run` against the fake keyless ollama server ends `done` with its reply and no auth header; an `ANTHROPIC_API_KEY` value is redacted by `redactSecretEnvValues` / `formatErrorLine`. Fail on base. |
| `REQ-agent-007` | `tests/agent.execute.test.ts` ("loadLlmEnv", "no provider configured …"), `tests/agent.tool-loop.test.ts` ("no provider: a tool-tier attempt fails …") | A key alone gives `model` "" and the notice; the attempt with `env: {}` returns `error: true` with the notice, `filesChanged` `[]`, and never calls fetch. Fail on base (demo summary / `gpt-4o-mini`). |
| `REQ-agent-079` | `tests/agent.tool-loop.test.ts` ("loadLlmEnv: the tier's key wins, else CORVIDINHO_LLM_MODEL, else no model"), `tests/agent.providers.test.ts` | Per-tier resolution unchanged; no model at all → `model` "" with the notice, never `gpt-4o-mini`; `perTierModels` gives "" for a tier with none; an unset model is not flagged as unpriced (`readSpendSnapshot` `priced`). |
| `REQ-agent-085`, `REQ-agent-015` | `tests/agent.verify-gate.test.ts`, `tests/agent.cli.test.ts` | The real-CLI cases now run against the fake provider (a reply with no tool call): a run that changes nothing reports no files and, in a carried talk worktree, still runs the lane; the no-provider run reports `filesChanged` `[]` (`tests/agent.providers.test.ts`). |
| `REQ-agent-260` | `tests/agent3md.smoke.test.ts` | Text-only change (the stale AGENT-13 name); the smoke still passes. |
| `REQ-cli-079` | `tests/agent.providers.test.ts` ("task run: the notice on stderr …", "the daemon logs llm.no_provider …") | `task run` with only a key exits 1, first stderr line the notice, `state=failed` with the notice on stdout, no demo text, never the key; `--json` result `failed` with the notice and no files. Daemon: `daemon.started` `llm: "none"` plus a warn `llm.no_provider` with the notice; with `ollama:qwen3`, `llm: "ollama:qwen3 @ 127.0.0.1:11434"` and no warn. Fail on base. |
| `REQ-cli-079` | `tests/docs.operator-facts.test.ts` ("the Logs table has a row for every event the daemon logs") | `docs/DAEMON.md` has the `llm.no_provider` row. |
| `REQ-cli-003` | `tests/cli.doctor-truth.test.ts` ("no usable model provider …", "an LLM key (either name) …", "per-tier model keys …", "init is report only …", "init in a complete project with a model and its key …"), `tests/agent.providers.test.ts` ("doctor / init …") | Exact `[warn] llm` lines for a model without its key and a key without a model (no `gpt-4o-mini`, no stub), `[ok] llm … model test-model @ api.openai.com`, per-tier detail (each tier's entry as configured, `anthropic:c` / `ollama:m`), `init` in an empty dir warns with the notice; `llmDoctorCheck` for ollama (`no key needed`), anthropic and a partly configured env; exit codes unchanged; no key value printed. Fail on base. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` ("init is report only …", "init in a complete project with a model and its key …") | `init` in an empty dir prints `[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set.` and exits 1 on the missing project files only; with a model and its key it prints `[ok] llm` and exits 0. Text-only change (the `llm` line's wording). |
| `REQ-cli-006`, `REQ-cli-007` | `tests/agent.cli.test.ts`, `tests/cli.plugins-run-argv.test.ts` ("`task run --task -h` runs the task …") | `task run --json` against the fake provider ends `done`, `verifySkipped`, no files, one "nothing to verify" event, no `fledge`; `--task -h` reaches the provider exactly once (fails on base: the stub made no request). |
| `REQ-cli-098` | `tests/agent.providers.test.ts` ("an unset model never shows as an unpriced model …") | Under a cap with model "", the snapshot is `priced` and the public `/status` spend line is absent. Fail on base. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` ("bot run settings (… LLM keys and model config …) do not reach the suite") | With `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `CORVIDINHO_LLM_MODEL` (+ `_READ/_TOOL/_CODE`), `CORVIDINHO_LLM_BASE_URL` and `CORVIDINHO_LLM_TIER` set, the child suite sees none and has no usable provider. Fails with the base preload. |
| `REQ-cli-505` | `tests/cli.project-path.test.ts` | `--project P task run` runs against the fake provider (a priced id, P's `.env` sets a cap) and ends `done` with P's specs; A's `.env` key and model give `[ok] llm` in A and are gone via `--project` (`[warn] llm`). |
| `REQ-discord-015` | `tests/agent.providers.test.ts` ("/status: the owner sees what to set …"), `tests/version.test.ts`, `tests/discord.slash.test.ts` ("/status reports metrics"), `tests/discord.spend.test.ts` | Owner: `LLM: none — <full notice>`; anyone else: `LLM: none — No model provider is configured.` and no `CORVIDINHO_` (the SAFE-14.a spend tests still pass on the whole body); partly configured and configured lines (`ollama:…`, `anthropic:…`, `gpt-test @ api.example.com`); `formatLlmStatusLine` without `ownerView` gives the non-owner line (fail closed); never a key, never "demo stub". Fail on base. |
| `REQ-discord-079` | `tests/agent.providers.test.ts` ("the Discord bridge warns once at start …") | A dry-run bridge with no model warns `[discord] <notice>`; with `ollama:qwen3` no no-provider line. Fail on base. |
| `REQ-watch-079` | `tests/agent.providers.test.ts` ("the WATCH poller prints the notice at start …") | A non-dry-run poller logs `[watch] <notice>`; with a model, or in a dry run, no such line. Fail on base. |

## Automated coverage

- New: `tests/agent.providers.test.ts` (18 tests); fixture
  `tests/fixtures/fake-llm.ts`.
- Moved to a fake provider or a configured model without weakening their
  assertions: `tests/agent.cli.test.ts`, `tests/agent.ndjson-spawn.test.ts`,
  `tests/agent.verify-gate.test.ts`, `tests/cli.project-path.test.ts`,
  `tests/cli.plugins-run-argv.test.ts` (spawned CLIs); key-only mock envs got
  a model in `tests/agent.{execute,tool-loop,events-ndjson,persona,project-instructions}.test.ts`,
  `tests/autonomous.{council,enabled}.test.ts`, `tests/safe.injection.test.ts`,
  `tests/fledge.{core,plugins}.test.ts`; bridge footer tests configure a
  priced model for the file (`useConfiguredModel`):
  `tests/discord.{rich-replies,slash-ask7,spend,inflight-replies,thinking-bridge,ask-ping}.test.ts`.
- Full `bun test`: every file passes.

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
