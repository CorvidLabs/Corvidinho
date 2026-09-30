---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: testing
---

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
