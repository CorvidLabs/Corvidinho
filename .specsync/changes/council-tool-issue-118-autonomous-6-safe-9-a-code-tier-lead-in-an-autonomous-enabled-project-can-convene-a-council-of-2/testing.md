---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-agent-118 | `tests/autonomous.council.test.ts` core: argv parse (default 3, clamp to 2..5, `--question` takes the next item), voice tier (read by default, code to tool, read lead stays read, unknown refused), prompt headers, lens, advise-only wording, quoted data, no confidence wording, scrub and cap |
| REQ-agent-118 | `tests/autonomous.council.test.ts` `runCouncil` with an in-process runner: phase order with peak concurrency 2; critique and chair prompts carry the right texts; 5 voices make 11 runs with distinct lenses; a failed proposal is dropped from critique; fewer than 2 proposals stops early; failed critiques still decide; failed chair; throwing runner; capped decision; per-voice timeout within the cap and the time left; council time cap; lead abort; pre-aborted signal |
| REQ-agent-118 | `tests/autonomous.council.test.ts` tool loop: `council` is offered only for an enabled project at code tier below the depth cap; a lead's `council` call against a `.ts` fake bin returns the decision in the tool message |
| REQ-plugins-118 | `tests/autonomous.council.test.ts` plugin: declaration and `plugins list`; SAFE-9 / ROLES-CHAT catalog; refusals exit 2 with nothing spawned (autonomous off, depth 2, tool tier, omitted tier, spent budget); usage exit 1; voice argv (`task run`, `--non-interactive`, `--tier read`, `--task` last, no `--no-verify`) and env (depth 1, empty allowlist despite a lead allowlist, `CORVIDINHO_ACTING_IS_ADMIN=0`, LLM key kept, GitHub / Discord tokens, audit key and confirm tokens dropped); `--tier code` clamped to tool; a decision longer than the 1800-char chat body kept whole (`resultText`); failed chair; council time cap (exit 130); one-at-a-time limiter; non-ADMIN `runPlugin council` refused |

Commands: `bun test tests/autonomous.*.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.
Fake runners are in process and the fake bin lives in a mkdtemp dir. No
network, no tokens, no worktrees.
