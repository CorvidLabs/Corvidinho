---
module: agent
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
---

# Delta — agent (the capability tier also picks the model, AGENT-5)

## Modified

### REQUIREMENT REQ-agent-007

The execute hook for `task run` SHALL call an OpenAI-compatible chat completions endpoint when `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`, with the model chosen for the run's capability tier per REQ-agent-079), and SHALL keep the demo execute stub (synthetic filesChanged for the verify-gate exercise) when no key is set. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover no-key path; key path mocks fetch (no live API in CI).
- Key present → every request's `model` is the run tier's model (REQ-agent-079); with no per-tier model key it is `CORVIDINHO_LLM_MODEL` (default `gpt-4o-mini`) as before.

### REQUIREMENT REQ-agent-009

The system SHALL accept capability tier `read|tool|code` via `--tier` or `CORVIDINHO_LLM_TIER` (default `tool`) so read-shaped work gets no tools and tool/code tiers filter plugins by `minTier` (AGENT-5). The default tool catalog SHALL omit dangerous plugins; runtime SAFE-1 SHALL still apply when dangerous tools are included. The effective tier (`--tier` over `CORVIDINHO_LLM_TIER`) SHALL also select the model the run calls (REQ-agent-079), so read-shaped work can stay on a cheaper model than tool and code work.

Acceptance Criteria
- read → no tools in chat request.
- tool/code → buildOpenAiTools filters by minTier; dangerous omitted by default.
- A read run sends the read model and a code run the code model; the `--tier` / `createTaskExecute` `tier` override, not `CORVIDINHO_LLM_TIER`, picks it.

## Added

### REQUIREMENT REQ-agent-079

`loadLlmEnv(env, tier?)` SHALL resolve the model for the run's effective capability tier (the explicit tier — `--tier` / `createTaskExecute` `tier` — else `CORVIDINHO_LLM_TIER`, default `tool`): the optional key for that tier (`CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL` or `CORVIDINHO_LLM_MODEL_CODE`; blank counts as unset) SHALL win, else `CORVIDINHO_LLM_MODEL`, else `gpt-4o-mini` (AGENT-5). Every chat request of the run SHALL carry that model in `body.model`, so SAFE-8 spend pricing prices the tier's model. The endpoint (`CORVIDINHO_LLM_BASE_URL`) and the API key SHALL stay shared by all tiers. Delegate workers and council voices SHALL inherit the per-tier keys (they are not worker-env-dropped) and SHALL resolve the model at their own tier. With no per-tier key set, every tier SHALL call `CORVIDINHO_LLM_MODEL` exactly as before. Model resolution SHALL NOT print or log the API key.

Acceptance Criteria
- `CORVIDINHO_LLM_MODEL=big`, `CORVIDINHO_LLM_MODEL_READ=cheap`: a read run sends `cheap`, tool and code runs send `big`; adding `CORVIDINHO_LLM_MODEL_CODE=big2` / `CORVIDINHO_LLM_MODEL_TOOL=mid` makes code send `big2` and tool `mid`.
- `CORVIDINHO_LLM_TIER=code` with `tier: "read"` sends `cheap`; `CORVIDINHO_LLM_TIER=read` with `tier: "code"` sends the code model.
- A read-tier `buildDelegateSpawn` env keeps the per-tier keys and resolves `cheap` (env tier or `--tier read`).
- Under a SAFE-8 cap, an unpriced read model stops a read run before any provider call and the spend-cap ask names that model.
- No per-tier keys → every tier sends `CORVIDINHO_LLM_MODEL`; a blank per-tier key falls back; no model at all → `gpt-4o-mini`.
- Fixture tests mock fetch; no live API.
