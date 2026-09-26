# Lesson bundle — council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Council tool (issue #118, AUTONOMOUS-6, SAFE-9): a code-tier lead in an autonomous-enabled project can convene a council of 2-5 delegated voices that deliberate in structured phases (propose, critique, decide) and get back a bounded transcript and a synthesized decision; voices run read tier by default with no mutating tools, reuse delegate caps and worker env stripping, and the tool stays hidden unless the session is allowed
- **Kind**: Feature
- **Specs**: agent, plugins
- **Paths**: src/autonomous, plugins/autonomous, tests/autonomous.council.test.ts, fledge.toml
- **Acceptance**: The council tool is registered dangerous=false, mutating=true, minTier=2, autonomous=true and is absent from the tool catalog unless the session is allowed (AUTONOMOUS-1 enabled, code tier, depth below cap; non-ADMIN role sessions never see it) (SAFE-9); a code-tier lead can call council with a question and 2-5 voices (default 3) and the council runs structured phases propose (independent answers), critique (each voice sees the proposals), decide (a chair synthesis) as delegated child task runs that reuse delegate spawn, env stripping, depth and concurrency caps; voices run read tier by default (tool at most, never above the lead), as non-ADMIN role sessions with an empty SAFE-1 allowlist so they never get mutating or must-ask tools; each phase entry is SAFE-6 scrubbed and capped and the whole council has a wall-clock cap; the result carries the decision and a bounded transcript; refusals (autonomous off, depth cap, below code tier, budget) spawn nothing; fake-bin tests prove phases, prompts, env, caps and refusals with no network

## Evidence

- Verification commit: `72c9e9c3dca13bc06e60324ec0675d583f8b0420`
- Base commit: `e92468411ff5a7eee83338af9d6e1f0332245800`
- Verified by: `specsync check --spec agent --spec plugins`

## From the change's context.md

# Context

Issue #118 asks for councils: several voices debate a big call. Leif chose it
in the planning interview. Captured HI for this slice:

- **AUTONOMOUS-6**  A council can deliberate in structured phases when a
  decision needs more than one voice.
- **AUTONOMOUS-1**  Autonomous mode is off until enabled in project config
  (the `[corvidinho.autonomous]` gate from #117 / PR #167).
- **SAFE-9**  Expensive cross-agent networking tools stay hidden until a
  session is allowed to use them, so small models cannot wander off starting
  councils unprompted.

Left for HI capture (not built): **AUTONOMOUS-11** (DRAFT), a council of
different models (Grok, Codex, others) that debates in rounds and hands back a
recommendation with a **confidence score**. This change ships no multi-model
routing and no confidence score; voices use the lead's provider.

Constraints a mid-flight session needs:

- This branch is stacked on PR #167 (`claude/autonomous-gate-delegate-117`),
  which adds the AUTONOMOUS-1 gate and the delegate core this change reuses.
  #167 was finalized and archived but not yet merged when this change started.
- Hot shared files stay untouched: the council needs no edit to
  `src/agent/execute.ts`, `src/agent/tools.ts` or `src/plugins/run.ts`. The
  `autonomous: true` flag from #167 already hides it (SAFE-9), and the
  `mutating: true` flag already keeps it from non-ADMIN sessions.
- No persistence: nothing is written to SQLite, so SCRUB_TARGETS does not
  change. Every voice text is still SAFE-6 scrubbed before it reaches the lead.

## From the change's design.md

# Design

## Shape

- `src/autonomous/council.ts` is the council core. `runCouncil` takes an
  injectable `CouncilVoiceRunner`, so the phase logic is tested in process.
  The plugin passes a runner that calls the delegate core's
  `runDelegateChild`.
- `plugins/autonomous/council.ts` is the `council` command (PLUGIN-5):
  `dangerous: false`, `mutating: true`, `minTier: 2`, `autonomous: true`.
  The handler checks gates in the same order as `delegate`: usage (exit 1),
  then AUTONOMOUS-1, top-level lead only (depth 0; a delegated worker is
  refused, so voices never outlive a worker its lead stops and one task's
  fan-out stays bounded), code tier and council budget (exit 2, nothing
  spawned).
- `plugins/autonomous/index.ts` registers `delegate` and `council`, checking
  for duplicates per command.
- `src/autonomous/delegate.ts` gains one additive field:
  `DelegateChildOutcome.resultText` is the worker's own result summary
  (scrubbed, capped at `DELEGATE_SUMMARY_MAX`). A voice, and above all the
  chair's decision, is then not cut at the 1800-char chat-body cap that
  `collectTaskRunStream` applies for Discord.

## Phases

1. **propose**: voices 1..N each get the question and a lens (pragmatist,
   skeptic, maintainer, safety, user) and answer independently.
2. **critique**: every voice whose proposal finished sees all finished
   proposals (its own labelled) and critiques the others.
3. **decide**: one chair run synthesizes a decision from the finished
   proposals and critiques. "The council advises; the lead decides."

Fewer than 2 finished proposals ends the council, because a council needs
more than one voice. Failed critiques do not block the chair. A failed chair
means ok=false with the transcript.

## Safety defaults (not HI claims)

- Voices run the `read` tier by default, `tool` at most, never above the lead.
- Voices are non-ADMIN role sessions. The voice base env carries
  `CORVIDINHO_ACTING_IS_ADMIN=0`; the delegate core drops inherited
  `CORVIDINHO_ACTING_*` keys and re-stamps `0` for a role session. Mutating
  tools, including `delegate` and `council`, are then absent and refused.
- Voices get an empty SAFE-1 allowlist, so any must-ask tool is denied in
  their non-interactive run. A council never executes a must-ask action.
- Reused from delegate: argv (`bun --no-env-file`, `--task` last, no
  `--no-verify`), env stripping (no Discord / GitHub tokens, no audit key),
  depth + 1, stop on abort / timeout / lead exit, scrubbed summaries.
- At most 2 voices run at once (`MAX_CONCURRENT_DELEGATES`). A council makes
  2N+1 runs (11 at most). One council runs at a time, 2 per lead run.
- Output is bounded: 1500 chars per voice entry and `DELEGATE_SUMMARY_MAX`
  for the decision. The tool result replaces the chair's transcript text
  with a pointer to `decision`, so the decision is not sent twice.
- Time: 5 min per voice (never more than the time left) and 15 min per
  council. Hitting the council cap or a lead abort stops running voices and
  skips later phases (state cancelled, exit 130).

## Rejected

- Sharing the delegate limiter (4 workers per run) would make a 3-voice
  council impossible, so the council keeps its own budget.
- A confidence score or per-voice model routing: that is draft AUTONOMOUS-11.
- Voices at code tier: voices advise; they do not act.

## From the change's testing.md

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-agent-118 | `tests/autonomous.council.test.ts` core: argv parse (default 3, clamp to 2..5, `--question` takes the next item), voice tier (read by default, code to tool, read lead stays read, unknown refused), prompt headers, lens, advise-only wording, quoted data, no confidence wording, scrub and cap |
| REQ-agent-118 | `tests/autonomous.council.test.ts` `runCouncil` with an in-process runner: phase order with peak concurrency 2; critique and chair prompts carry the right texts; 5 voices make 11 runs with distinct lenses; a failed proposal is dropped from critique; fewer than 2 proposals stops early; failed critiques still decide; failed chair; throwing runner; capped decision; per-voice timeout within the cap and the time left; council time cap; lead abort; pre-aborted signal |
| REQ-agent-118 | `tests/autonomous.council.test.ts` tool loop: `council` is offered only for an enabled project at code tier below the depth cap; a lead's `council` call against a `.ts` fake bin returns the decision in the tool message |
| REQ-plugins-118 | `tests/autonomous.council.test.ts` plugin: declaration and `plugins list`; SAFE-9 / ROLES-CHAT catalog; refusals exit 2 with nothing spawned (autonomous off, depth 1 delegated worker with no budget spent, depth 2, tool tier, omitted tier, spent budget); usage exit 1; voice argv (`task run`, `--non-interactive`, `--tier read`, `--task` last, no `--no-verify`) and env (depth 1, empty allowlist despite a lead allowlist, `CORVIDINHO_ACTING_IS_ADMIN=0`, LLM key kept, GitHub / Discord tokens, audit key and confirm tokens dropped); `--tier code` clamped to tool; a decision longer than the 1800-char chat body kept whole (`resultText`); failed chair; council time cap (exit 130); one-at-a-time limiter; non-ADMIN `runPlugin council` refused |

Commands: `bun test tests/autonomous.*.test.ts`, `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.
Fake runners are in process and the fake bin lives in a mkdtemp dir. No
network, no tokens, no worktrees.

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
