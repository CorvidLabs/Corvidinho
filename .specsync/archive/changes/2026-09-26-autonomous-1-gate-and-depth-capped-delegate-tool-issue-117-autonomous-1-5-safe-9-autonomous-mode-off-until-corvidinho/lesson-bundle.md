# Lesson bundle — autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed
- **Kind**: Feature
- **Specs**: agent, plugins
- **Paths**: src/autonomous, plugins/autonomous, src/agent/tools.ts, src/agent/execute.ts, src/plugins, fledge.toml, tests
- **Acceptance**: Autonomous mode is off unless the project fledge.toml sets [corvidinho.autonomous] enabled = true (AUTONOMOUS-1); the delegate tool is absent from the task-run tool catalog unless the session is allowed (autonomous enabled, code tier, delegation depth below the cap) (SAFE-9); a code-tier lead can call delegate with a skill label and a subtask, which runs a child corvidinho task run (bun --no-env-file, non-interactive, no-verify, ndjson) at the same or lower tier with the depth counter incremented and returns the worker summary, tier, depth and filesChanged for the lead to synthesize (AUTONOMOUS-5); depth >= 2, tier above parent, concurrent children > 2 or more than 4 children per run are clamped or refused; fake-bin tests prove argv, env, clamp, gate and refusal paths with no network

## Evidence

- Verification commit: `025c2abe41ebbf474cafd476bf9abf6ed6e64b0e`
- Base commit: `554357fbf27b524e32cfcd29377d3c38557883e3`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #117 (M6 multi-agent, build step 10 of 13): Leif chose sub-agents
(workers per task or repo) as part of multi-agent, not replacing orc.
Captured HI in scope: **AUTONOMOUS-1** (autonomous mode off until enabled in
project config), **AUTONOMOUS-5** (a lead agent can delegate subtasks to peers
by skill and synthesize the result), **SAFE-9** (expensive cross-agent tools
stay hidden until a session is allowed to use them). **PLUGIN-5** (autonomous
extras are plugins left disabled until opt-in) and **PLUGIN-2** (every command
declares danger + minTier) shape the host side.

Draft **AUTONOMOUS-10** (worker never exceeds the parent; depth <= 2) is NOT
an acceptance criterion. A hard depth / fan-out cap and a tier clamp are still
required for safety, so they ship as conservative safety defaults, not HI
claims; AUTONOMOUS-10 stays left for HI capture.

Project config already exists: `loadAgentConfig` reads the project's
`fledge.toml` `[corvidinho]` section, and `fledge.toml` is SAFE-2 protected
infra (file tools cannot write it). The switch lives there as
`[corvidinho.autonomous] enabled = true` (Merlin `[merlin.autonomous]` shape);
no new config file and no env switch.

Ruled out for this slice: a worker per worktree (#58 dependency: workers
share the lead's cwd and the lead's verify gate covers their edits), spend
charged to parent caps (SAFE-8 / AUTONOMOUS-8 budget not built), routing by
persona skill tags (AUTONOMOUS-2 personas not built: the skill is a label the
lead attaches and gets back), a persistent roster (G45, out of scope).

## From the change's design.md

# Design

- `src/autonomous/enabled.ts`: AUTONOMOUS-1 gate. Minimal TOML scrape of
  `<cwd>/fledge.toml` (same approach as `parseCorvidinhoSection`); enabled only
  for the literal `true` at key `corvidinho.autonomous.enabled` (table or
  dotted key). Any later `[table]` / `[[array]]` header ends the scope; inline
  tables and non-literal values are off. `autonomousSessionAllowed({cwd, env})`
  = enabled AND delegation depth below the cap (SAFE-9 session gate).
- `src/autonomous/delegate.ts`: worker core. Depth in
  `CORVIDINHO_DELEGATE_DEPTH` (unset 0; malformed fails closed to the cap 2).
  `clampChildTier(parent, requested)`: omitted means the parent tier (never a
  higher global default, the Merlin m#1136 bug class); above parent is
  clamped; unknown is refused. Spawn via `buildCorvidinhoArgv` (bun
  `--no-env-file` for `.ts`):
  `task run --non-interactive --tier T --output ndjson --task TEXT`
  with `--task` last. Forced env: depth+1, tier, non-interactive, the lead's
  effective allowlist, ADMIN off, no SAFE-4 confirm tokens. Bin is
  `CORVIDINHO_BIN`, else this checkout's `src/cli.ts` (never the cwd's).
  Limiter: 2 concurrent, 4 per process; refuse, never queue. The worker is
  killed (SIGTERM, then SIGKILL after 2s) on lead abort, 10 min timeout, or
  lead `exit`; its pipes are wrapped so a grandchild holding them cannot hang
  the lead beyond a 1s drain after exit. Summary SAFE-6 scrubbed, capped 4000.
- `plugins/autonomous/`: `delegate` PluginCommand with `dangerous: false`
  (adds no power the lead lacks; cost bounded by caps + SAFE-9 hiding),
  `minTier: 2`, `autonomous: true`. The handler re-checks every gate at run
  time (parse, AUTONOMOUS-1, depth, code tier, limiter) so `plugins run` or a
  model naming the tool cannot skip them.
- Hooks in shared files kept small: `PluginCommand.autonomous`,
  `PluginHandlerArgs.tier/signal`, `runPlugin` pass-through,
  `buildOpenAiTools({autonomous})` filter line, `createTaskExecute` computes
  the session gate and passes tier + signal to `runPlugin`, builtins load.
- Workers never pass `--no-verify` (REQ-cli-085, #85 always prove-before-done
  for product spawns): a worker that changed files runs the project's verify
  lane itself (AGENT-4 / 4.a retries), reports `verified` / `verifySkipped`,
  and its filesChanged also join the lead's result so the lead's own gate
  covers the combined change. Tool calls dispatch sequentially, so two workers
  of one lead do not verify the shared cwd at the same time.

## From the change's testing.md

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-agent-117 | `tests/autonomous.enabled.test.ts`: on/off TOML fixtures (table, dotted key, comments; string / number / inline table / later table / `[[array]]` stay off), repo ships off, session gate by depth; `buildOpenAiTools` hides `delegate` by default and below code tier; `createTaskExecute` catalog per temp project + tier + depth; a hidden `delegate` call is refused (REQ-agent-128); lead tool loop to a fake-bin worker: the tool message carries the worker summary and the lead's filesChanged include the worker's |
| REQ-agent-117 | `tests/autonomous.delegate.test.ts` core: depth parse fails closed, tier clamp (omitted = parent, above = clamped, unknown refused), argv parse (`--task` takes the next item even `--tier=code`), spawn argv (`bun --no-env-file`, `--task` last, no `--no-verify`) and forced env over inherited env, bin resolution, limiter caps |
| REQ-agent-117 | `tests/autonomous.delegate.test.ts` worker env: `DISCORD_*` / `GITHUB_TOKEN` / `GH_TOKEN` / `CORVIDINHO_AUDIT_HMAC_KEY` / `CORVIDINHO_ACTING_*` dropped and LLM keys kept (spawn env and the spawned fake worker's env); role-session lead ⇒ `CORVIDINHO_ACTING_IS_ADMIN=0`, CLI lead ⇒ unset. `tests/autonomous.enabled.test.ts`: non-ADMIN role session catalog omits `delegate`, ADMIN owner catalog offers it (ROLES-CHAT-2/4) |
| REQ-plugins-117 | `tests/autonomous.enabled.test.ts`: `delegate` declared mutating (registry + list entry); non-ADMIN catalog omits it at code tier with autonomous allowed; `runPlugin delegate` in a non-ADMIN role session refused exit 2 "not allowed for your role", nothing spawned (ROLES-CHAT-3) |
| REQ-plugins-117 | `tests/autonomous.delegate.test.ts` handler: refusals exit 2 with nothing spawned (autonomous off, depth 2, tool tier, omitted tier with default env, spent budget); usage exit 1; happy path argv (no `--no-verify`) / env / data incl. verified / verifySkipped; omitted tier inherits env code tier at depth 2; worker failure summary scrubbed (SAFE-6); timeout and abort stop the worker; a bin that cannot start is a clean failure with the slot released; a grandchild-held pipe does not hang; `.env` in the cwd is not loaded by a `.ts` worker |

Commands: `bun test tests/autonomous.*.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.
Fake bins live in mkdtemp dirs; no network, no tokens, no worktrees.

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
