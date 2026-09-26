---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-agent-117 | `tests/autonomous.enabled.test.ts`: on/off TOML fixtures (table, dotted key, comments; string / number / inline table / later table / `[[array]]` stay off), repo ships off, session gate by depth; `buildOpenAiTools` hides `delegate` by default and below code tier; `createTaskExecute` catalog per temp project + tier + depth; a hidden `delegate` call is refused (REQ-agent-128); lead tool loop to a fake-bin worker: the tool message carries the worker summary and the lead's filesChanged include the worker's |
| REQ-agent-117 | `tests/autonomous.delegate.test.ts` core: depth parse fails closed, tier clamp (omitted = parent, above = clamped, unknown refused), argv parse (`--task` takes the next item even `--tier=code`), spawn argv (`bun --no-env-file`, `--task` last) and forced env over inherited env, bin resolution, limiter caps |
| REQ-plugins-117 | `tests/autonomous.delegate.test.ts` handler: refusals exit 2 with nothing spawned (autonomous off, depth 2, tool tier, omitted tier with default env, spent budget); usage exit 1; happy path argv / env / data; omitted tier inherits env code tier at depth 2; worker failure summary scrubbed (SAFE-6); timeout and abort stop the worker; a bin that cannot start is a clean failure with the slot released; a grandchild-held pipe does not hang; `.env` in the cwd is not loaded by a `.ts` worker |

Commands: `bun test tests/autonomous.*.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.
Fake bins live in mkdtemp dirs; no network, no tokens, no worktrees.
