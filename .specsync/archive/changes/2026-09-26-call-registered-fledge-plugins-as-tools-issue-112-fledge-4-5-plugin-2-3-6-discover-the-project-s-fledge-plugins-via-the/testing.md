---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-112 | `tests/fledge.plugins.test.ts` discovery parse, invalid names, degrade (missing / exit 3 / bad JSON / timeout), audit unavailable, registration markings, collisions, description |
| REQ-plugins-113 | `tests/fledge.plugins.test.ts` SAFE-1 deny, allowlisted argv/cwd/env, exit 7, timeout 124, missing binary 127, scrub + cap, child env |
| REQ-plugins-114 | `tests/fledge.plugins.test.ts` cost per entry, report totals/origins, over-budget + oversized text |
| REQ-cli-112 | `tests/fledge.cli.test.ts` list text/json with fake fledge, no-fledge degrade, run deny/allow, unknown name |
| REQ-agent-112 | `tests/fledge.plugins.test.ts` tool loop offers + runs `fledge-hello` with includeDangerous; default catalog never discovers; `tests/agent.tool-loop.test.ts` unchanged |

All fixtures use a fake `fledge` shell script on a temp PATH — no network, no
real plugins, no tokens. Commands: `bun test tests/fledge.plugins.test.ts
tests/fledge.cli.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.
