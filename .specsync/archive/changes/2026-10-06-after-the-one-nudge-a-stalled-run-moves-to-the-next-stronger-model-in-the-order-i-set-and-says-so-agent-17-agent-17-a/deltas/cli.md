---
module: cli
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
---

# Delta: cli (help and .env.example list the model order; the test preload unsets it — AGENT-17.a)

## Modified

### REQUIREMENT REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop and the same verify gate, which no caller can skip (AGENT-14). The tier SHALL also select the model the run calls (REQ-agent-079). Help SHALL document the optional per-tier model keys `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, and when any of them is set the doctor `[ok] llm` line SHALL name the model each tier calls (model names only, never the API key); with none set the line SHALL read as before. Help and `.env.example` SHALL also document the optional model order `CORVIDINHO_LLM_MODEL_ORDER` (AGENT-17.a, REQ-agent-088); it does not change the doctor line.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.
- Help lists `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE`.
- Help lists `CORVIDINHO_LLM_MODEL_ORDER`, and `.env.example` documents it (same entries, weakest first; unset = no move).
- With `CORVIDINHO_LLM_MODEL=big`, `_READ=cheap` and `_CODE=big2`, doctor prints `[ok] llm: … model big; per tier: read cheap, tool big, code big2` and exits 0 without the key value; with no per-tier key the line ends `model big`.

### REQUIREMENT REQ-cli-262

The test suite SHALL NOT write the operator's Corvidinho state (SAFE-5). The
bun test preload (`tests/preload.ts`, loaded by `bunfig.toml`) SHALL always
point `CORVIDINHO_DATA_DIR` at its own temporary directory, overriding an
inherited value, and SHALL unset `CORVIDINHO_AUDIT_HMAC_KEY`,
`CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR`, so a suite run with the
operator's env (including the prove-before-done verify lane spawned from
Discord, WATCH, the daemon or `task run`) never adds audit rows, sessions or
memory to the operator's DB and never signs a test audit row with the
operator's key. A process a test spawns with `Bun.spawn` / `Bun.spawnSync` and
no explicit `env` SHALL get the preload's env, not the environment the test
process started with. The preload SHALL also unset the run and operator
settings that change test outcomes on the bot box, so the suite runs as it
does on CI: `CORVIDINHO_NON_INTERACTIVE` and `FLEDGE_NON_INTERACTIVE` (every
Discord, WATCH and daemon task run sets the first, and its verify lane runs
the suite), `CORVIDINHO_DAILY_SPEND_CAP_USD`, the LLM API keys
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (so `bun
test` never sends a real model call), the operator's model config
`CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`,
`CORVIDINHO_LLM_MODEL_ORDER` (AGENT-17.a: it would move a stalled test run),
`CORVIDINHO_LLM_BASE_URL`, `CORVIDINHO_LLM_TIER` and `OLLAMA_HOST` (a keyless
`ollama:` model would call a local server, and the no-provider tests expect
no model; tests configure a fake provider themselves, AGENT-13), `BRAVE_SEARCH_API_KEY` (so it never sends a real, paid web
search, PLUGIN-7), `GIPHY_API_KEY` (so it never sends a real GIF search,
PLUGIN-8), and `CORVIDINHO_DISCORD_SESSION_ID` (a scheduled run's
`schedule_*` id narrows the GitHub gate, DISCORD-SCHEDULE-3.a, and its verify
lane inherits it). No new env var, config key or command.

Acceptance Criteria
- With the operator's `CORVIDINHO_DATA_DIR`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` set, a child `bun test` writes 0 audit rows (and no file) to the operator data dir; its rows, including a CLI run it spawns, land in the preload's temp dir.
- An operator DB that already holds an audit chain keeps the same row count and last hash after the child run, and no test row is keyed with the operator's key.
- A CLI or shell a test spawns without an explicit `env` (`Bun.spawn(argv)`, `Bun.spawn({ cmd })`, `Bun.spawnSync(argv)`) resolves the preload's data dir and sees no audit key, WATCH spawn log or worktree base override.
- Full `bun test` with those operator vars set passes and leaves the operator data dir empty.
- With `CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`, `GIPHY_API_KEY` and a `schedule_*` `CORVIDINHO_DISCORD_SESSION_ID` set, a child `bun test` sees none of them: it is not non-interactive and has no LLM API key; full `bun test` with them set passes.
- With `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, `CORVIDINHO_LLM_BASE_URL` and `CORVIDINHO_LLM_TIER` set too, a child `bun test` sees none of them and has no usable model provider.
- With `CORVIDINHO_LLM_MODEL_ORDER` set too, a child `bun test` does not see it.
