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
