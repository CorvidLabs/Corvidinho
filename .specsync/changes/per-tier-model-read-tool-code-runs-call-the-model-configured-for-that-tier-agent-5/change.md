---
id: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
state: verifying
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5)

## Intent

Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5)

## Affected Canonical Specs

- `agent`
- `cli`

## Acceptance Criteria

- With optional CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE set, a read-tier run sends the read model in body.model and a code-tier run the code model (each falling back to CORVIDINHO_LLM_MODEL, then gpt-4o-mini); the --tier/opts.tier override picks the model, not CORVIDINHO_LLM_TIER; a read-tier delegate/council worker resolves the read model; SAFE-8 pricing follows the tier's model; doctor [ok] llm names the per-tier models (never the key) and help documents the keys; with no per-tier keys every tier sends CORVIDINHO_LLM_MODEL as before. Tests: tests/agent.tool-loop.test.ts per-tier model (AGENT-5), tests/autonomous.delegate.test.ts, tests/cli.doctor-truth.test.ts, tests/agent.cli.test.ts, failing on main. Under a SAFE-8 cap the unpriced-model ask names the key that set the run's model (the tier's key when set, else CORVIDINHO_LLM_MODEL), and with any per-tier key set doctor spend and Discord /status warn when any tier's model has no known price and name that tier (tests/agent.tool-loop.test.ts, tests/cli.doctor-truth.test.ts).

## No-spec Rationale

Not applicable
