---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: design
---

# Design

## Shape

- `src/autonomous/council.ts` is the council core. `runCouncil` takes an
  injectable `CouncilVoiceRunner`, so the phase logic is tested in process.
  The plugin passes a runner that calls the delegate core's
  `runDelegateChild`.
- `plugins/autonomous/council.ts` is the `council` command (PLUGIN-5):
  `dangerous: false`, `mutating: true`, `minTier: 2`, `autonomous: true`.
  The handler checks gates in the same order as `delegate`: usage (exit 1),
  then AUTONOMOUS-1, depth cap, code tier and council budget (exit 2,
  nothing spawned).
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
