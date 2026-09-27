# Agent — testing

`tests/agent.loop.test.ts`, `tests/agent.config.test.ts`, `tests/agent.cli.test.ts`.
- `tests/autonomous.enabled.test.ts`: AUTONOMOUS-1 gate fixtures, SAFE-9 catalog
  hiding, ROLES-CHAT non-ADMIN / ADMIN catalogs, tool-loop delegate via a fake
  bin (REQ-agent-117).
- `tests/autonomous.council.test.ts`: council core with an in-process fake
  runner (phase order, concurrency <= 2, critique / chair prompts, failed
  voices, < 2 proposals, failed chair, scrub + caps, per-voice and council time
  caps, lead abort) and the tool loop offering / running `council` against a
  `.ts` fake bin (REQ-agent-118).

## Soft-land tool rounds (REQ-agent-312)

`tests/agent.soft-land.test.ts` covers exhaustion soft-land, chatBody scrub, and mention rewrite.

## Per-tier model (REQ-agent-079)

`tests/agent.tool-loop.test.ts` "per-tier model (AGENT-5, REQ-agent-079)":
fallback order, `--tier` override precedence, request `model` per tier, no
per-tier keys = unchanged, SAFE-8 pricing of an unpriced read model (the ask
names the key that set it), `modelKeyForTier` / `perTierModels`, and doctor /
`/status` spend lines that flag an unpriced per-tier model with its tier.
`tests/autonomous.delegate.test.ts`: a read-tier worker env resolves the read
model. `tests/cli.doctor-truth.test.ts` / `tests/agent.cli.test.ts`: doctor
`[ok] llm` per-tier line and help (REQ-cli-009).
