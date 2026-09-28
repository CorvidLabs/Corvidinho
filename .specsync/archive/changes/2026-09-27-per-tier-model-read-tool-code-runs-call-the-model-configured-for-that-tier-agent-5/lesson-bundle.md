# Lesson bundle — per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5)
- **Kind**: Feature
- **Specs**: agent, cli
- **Paths**: src/agent/tier.ts, src/agent/execute.ts, src/agent/index.ts, src/doctor.ts, src/cli.ts, .env.example, tests/agent.tool-loop.test.ts, tests/autonomous.delegate.test.ts, tests/cli.doctor-truth.test.ts, tests/agent.cli.test.ts, src/agent/spend.ts, src/agent/spend-notice.ts
- **Acceptance**: With optional CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE set, a read-tier run sends the read model in body.model and a code-tier run the code model (each falling back to CORVIDINHO_LLM_MODEL, then gpt-4o-mini); the --tier/opts.tier override picks the model, not CORVIDINHO_LLM_TIER; a read-tier delegate/council worker resolves the read model; SAFE-8 pricing follows the tier's model; doctor [ok] llm names the per-tier models (never the key) and help documents the keys; with no per-tier keys every tier sends CORVIDINHO_LLM_MODEL as before. Tests: tests/agent.tool-loop.test.ts per-tier model (AGENT-5), tests/autonomous.delegate.test.ts, tests/cli.doctor-truth.test.ts, tests/agent.cli.test.ts, failing on main. Under a SAFE-8 cap the unpriced-model ask names the key that set the run's model (the tier's key when set, else CORVIDINHO_LLM_MODEL), and with any per-tier key set doctor spend and Discord /status warn when any tier's model has no known price and name that tier (tests/agent.tool-loop.test.ts, tests/cli.doctor-truth.test.ts).

## Evidence

- Verification commit: `273a7e28e75d9987ce0a72ecafd1e16cfe3b4777`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

# Context

Captured HI: **AGENT-5** (`hi/agent.md`): "I can pick a provider and a
capability tier so cheap models stay on read-shaped work and expensive ones are
used when tools and code are required." Issues #79 / #80.

On main (fc0ed8d) the tier already decides the tool catalog (REQ-agent-009,
REQ-agent-128) and delegate / council refuse below code tier, but the tier does
not choose the model: `loadLlmEnv` read one `CORVIDINHO_LLM_MODEL` (default
`gpt-4o-mini`) for every tier, and `run()` spread `{ ...llm, tier }` after the
`--tier` override, so a read-tier run and a code-tier run always called the same
model. Delegate workers and council voices (read tier by default) inherit the
lead's env, so they called the lead's model too. Repro on main:
`createTaskExecute` with `CORVIDINHO_LLM_MODEL=big` and a fetch stub recording
`body.model` sends `big` at tier read and at tier code; no config makes them
differ.

Constraints: no new slash command, bridge surface or config file; no SQLite
schema change; endpoint and key stay shared (per-tier endpoint is a follow-up
question for Leif). Out of scope (drafts in #79 / #80, not captured): native
Ollama / Anthropic / headless-CLI adapters, removing the `gpt-4o-mini` default,
a no-provider startup warning, fallback chains, idle timeout, turn cap. Draft
"AGENT-9" in #79 collides with captured AGENT-9 (tool-round soft-land).
Multi-model councils (draft AUTONOMOUS-11) are not implemented: all voices at
one tier still share that tier's model.

## From the change's design.md

# Design

- Three optional env keys, one per tier (`CORVIDINHO_LLM_MODEL_READ`,
  `_TOOL`, `_CODE`), each falling back to `CORVIDINHO_LLM_MODEL`, then the
  existing `gpt-4o-mini` default. Chosen as the most conservative shape that
  meets AGENT-5: optional, today's behaviour when unset, same env-only
  configuration style as the other LLM keys, no config-file or slash surface.
  **Pending Leif:** env keys vs a tier map in `CORVIDINHO_LLM_MODEL` or a
  `fledge.toml` key.
- Endpoint and key stay shared by all tiers. **Pending Leif:** whether a tier
  should also pick its own endpoint / key (e.g. local Ollama for read, hosted
  API for code) — a follow-up slice.
- Resolution lives in `modelForTier` (`src/agent/tier.ts`); `loadLlmEnv(env, tier?)`
  takes the explicit tier so `--tier` re-resolves the model (main spread
  `{ ...llm, tier }` and kept the env tier's model).
- SAFE-8 needs no change: `createSpendGuard` prices `body.model`, which is now
  the tier's model.
- Delegate / council children already get `--tier` plus the inherited env; the
  per-tier keys are not in the worker drop list, so a read-tier child resolves
  the read model with no delegate change.
- Callers without a tier (`/status`, Discord thinking footer, doctor `spend`)
  keep `loadLlmEnv(env).model`, i.e. the env tier's model, which is what a
  bridge run (no `--tier`) calls.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-079` | `tests/agent.tool-loop.test.ts` "per-tier model (AGENT-5, REQ-agent-079)" | `loadLlmEnv` fallback order (tier key → `CORVIDINHO_LLM_MODEL` → `gpt-4o-mini`, blank key falls back, explicit tier over env, shared endpoint/key); `createTaskExecute` sends `cheap` at read, `big` at tool/code, `big2`/`mid` with code/tool keys; `opts.tier` over `CORVIDINHO_LLM_TIER` picks the model; SAFE-8: an unpriced read model stops the read run with 0 provider calls and the ask names it. Four of these fail on main (`big` sent / env ignored; the spend test makes a call). |
| `REQ-agent-079` | `tests/autonomous.delegate.test.ts` "a read-tier worker keeps the per-tier model keys and resolves the read model" | Worker env keeps `_READ` / `_CODE`, `--tier read`; `loadLlmEnv` on it resolves `cheap`; fails on main (`big`). |
| `REQ-agent-079` | `tests/agent.tool-loop.test.ts` "SAFE-8 pricing follows the tier's model…", "modelKeyForTier / perTierModels", "SAFE-8 doctor and /status flag an unpriced per-tier model with its tier; none set = as before"; `tests/cli.doctor-truth.test.ts` "per-tier model keys (AGENT-5)…" | Review fix: the unpriced ask names `CORVIDINHO_LLM_MODEL_READ` for a read run (and `CORVIDINHO_LLM_MODEL` for a tool run on the shared model), not the already-priced shared key; with a priced configured model and an unpriced read (or fallback tool) model, `spendDoctorCheck` / `readSpendSnapshot` / `formatSpendStatusLine` warn and name the tier; every tier priced or no per-tier key reads as before; `corvidinho doctor` prints `[warn] spend: … read-tier runs stop and ask`. These fail with the PR's first-push `spend.ts` / `spend-notice.ts` / `execute.ts` (doctor said `[ok] spend` while every read-tier run stopped mid-task). |
| `REQ-agent-007` / `REQ-agent-009` | `tests/agent.tool-loop.test.ts` "no per-tier keys: every tier sends CORVIDINHO_LLM_MODEL, as before", "read tier sends no tools", tier tests | Regression guard passes on main and on the branch; existing tier / catalog tests unchanged. |
| `REQ-cli-009` | `tests/cli.doctor-truth.test.ts` "per-tier model keys (AGENT-5): [ok] llm names each tier's model, never the key"; `tests/agent.cli.test.ts` "help mentions task run and --no-verify" | Doctor prints `model big; per tier: read cheap, tool big, code big2`, exit 0, no key value; plain line unchanged. Help lists `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE`. Both fail on main. |

Fail-on-main proof: with main's `src/agent/{execute,tier,index}.ts`,
`src/doctor.ts` and `src/cli.ts` swapped in (plus a shim exporting the new
names so the tests import), 7 new tests fail and 65 pass; with the branch
sources restored all 72 pass.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
