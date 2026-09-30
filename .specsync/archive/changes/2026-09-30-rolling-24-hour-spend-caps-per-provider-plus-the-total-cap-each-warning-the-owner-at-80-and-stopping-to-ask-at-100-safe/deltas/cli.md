---
module: cli
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
---

# Delta: cli (doctor shows each spend cap; help, .env.example and the test preload know CORVIDINHO_PROVIDER_SPEND_CAPS_USD, SAFE-14 / SAFE-15)

## Modified

### REQUIREMENT REQ-cli-098

`corvidinho doctor` SHALL always print a `spend` line (AUTONOMOUS-8 /
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` and
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` it SHALL be `info` and say no daily cap
is set, without opening the database; with provider caps only it SHALL say
no total daily cap is set, with no amount (`info`, or `warn` for an unpriced
model a provider cap covers). With the total cap set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). After it, doctor SHALL print one
`spend provider:<id>` line per provider cap (SAFE-14 / SAFE-15,
REQ-agent-114): that provider's 24-hour spend against its cap with the
percent, the calls counted and those still at their estimate, marked `warn`
at or past 80% and at the cap. When `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` is
invalid (a malformed entry or a provider no configured model uses) the
`spend` line SHALL be `warn` and name the setting, never its value; every
provider call then stops and asks. A tier with no configured model (AGENT-10)
calls nothing, so it SHALL NOT count as an unpriced model: neither this line
nor the `/status` spend lines warn or say paused for it. The line SHALL be informational and SHALL
NOT change the doctor exit code. `task run` SHALL copy the run's 80% spend
warning onto `TaskResult.spendWarning` in `--json` output and the NDJSON
`result` frame, and a run stopped at the cap SHALL exit 0 with state
`blocked`; in text output it SHALL print the generic summary and the ask
question. `corvidinho daemon`, which has no Discord, SHALL log a `warn`
`spend.warning` line for a schedule run that crossed 80% of a cap (a
provider cap's `message` names its `provider:<id>` scope) and a `warn`
`run.needs_human` line with the ask reason for a run that stopped to ask,
leaving the recorded warning and the ask recorded on the run row pending for
a bridge to deliver (REQ-discord-347; AUTONOMY-2 / AUTONOMOUS-7). The daemon
SHALL NOT post or take the ask itself and still needs no Discord token
(REQ-cli-108). `--help` and `.env.example` SHALL list both variables and say
each cap warns at 80% and stops and asks at 100%; for
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` they SHALL say it is a `provider=USD`
comma list keyed on the provider id (the endpoint host) and that a bad entry
or unknown provider stops every call.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints `[info] spend: no daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)`.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)`.
- Invalid cap, unpriced model, 80% and cap reached yield a `warn` line with `ok: true`.
- `task run --json` against a localhost mock LLM carries `result.spendWarning` on the crossing run only, and at the cap returns `blocked` with a `spend-cap` ask, the generic summary and exit 0 without calling the mock; `--output text` at the cap prints the summary and the ask question.
- The daemon logs `spend.warning` (amounts and percent) and `run.needs_human` (`reason` `spend-cap`) as `warn` lines for a schedule run that reports them.
- A stuck schedule run the daemon claims logs `run.needs_human` (`reason` `stuck`), is recorded with its ask pending, and a Discord bridge started later on the same data dir posts it to the owner once.
- Under a cap with no model configured, `readSpendSnapshot` is `priced` and the public `/status` spend line is absent (not "paused for budget").
- With `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.anthropic.com=2` and an Anthropic model, `doctor` prints `[info] spend: no total daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)` and `[ok] spend provider:api.anthropic.com: $0.00 of $2.00 daily cap for api.anthropic.com used in the last 24h (0%; 0 provider call(s); CORVIDINHO_PROVIDER_SPEND_CAPS_USD, SAFE-14)`; a provider at 80% or at its cap is `warn`; an invalid provider setting is a `warn` `spend` line naming the setting and not its value.
- `--help` lists `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`.

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
the suite), `CORVIDINHO_DAILY_SPEND_CAP_USD` and
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` (SAFE-14), the LLM API keys
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (so `bun
test` never sends a real model call), the operator's model config
`CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`,
`CORVIDINHO_LLM_BASE_URL`, `CORVIDINHO_LLM_TIER` and `OLLAMA_HOST` (a keyless
`ollama:` model would call a local server, and the no-provider tests expect
no model; tests configure a fake provider themselves, AGENT-13), and `CORVIDINHO_DISCORD_SESSION_ID` (a scheduled run's
`schedule_*` id narrows the GitHub gate, DISCORD-SCHEDULE-3.a, and its verify
lane inherits it). No new env var, config key or command.

Acceptance Criteria
- With the operator's `CORVIDINHO_DATA_DIR`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` set, a child `bun test` writes 0 audit rows (and no file) to the operator data dir; its rows, including a CLI run it spawns, land in the preload's temp dir.
- An operator DB that already holds an audit chain keeps the same row count and last hash after the child run, and no test row is keyed with the operator's key.
- A CLI or shell a test spawns without an explicit `env` (`Bun.spawn(argv)`, `Bun.spawn({ cmd })`, `Bun.spawnSync(argv)`) resolves the preload's data dir and sees no audit key, WATCH spawn log or worktree base override.
- Full `bun test` with those operator vars set passes and leaves the operator data dir empty.
- With `CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY` and a `schedule_*` `CORVIDINHO_DISCORD_SESSION_ID` set, a child `bun test` sees none of them: it is not non-interactive and has no LLM API key; full `bun test` with them set passes.
- With `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, `CORVIDINHO_LLM_BASE_URL` and `CORVIDINHO_LLM_TIER` set too, a child `bun test` sees none of them and has no usable model provider.
