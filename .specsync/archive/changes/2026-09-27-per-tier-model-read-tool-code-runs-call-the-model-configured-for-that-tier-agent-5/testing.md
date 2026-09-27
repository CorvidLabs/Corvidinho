---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: testing
---

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
