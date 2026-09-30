---
id: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
state: verifying
type: feature
base_commit: 9abc768f5b1a2122ae55025efea32b4a9113e249
---

# When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a)

## Intent

When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a)

## Affected Canonical Specs

- `agent`
- `watch`
- `discord`

## Acceptance Criteria

- AGENT-16 (captured, Leif's 2026-09-28 interview round 2) and AGENT-16.a (captured with hi in this PR from Leif's round 13 decision, 2026-09-30) hold: in every task run (chat, /session, /work, buttons, schedules, WATCH, delegate and council workers) the tool loop counts ok:false results per call signature (tool name + canonical argv; refusals and denials count), a real change (a result reporting filesChanged, or a successful real write tool, one explicit changedState predicate that classifies every dangerous or mutating builtin) resets every count and a call's own success resets its own; the 2nd identical failure gets a harness steer after its whole tool result quoting a scrubbed error excerpt; the next identical call once the model saw that steer in this conversation does not run and the attempt ends with the existing stuck HumanAsk naming only the offered tool (runTask blocked, owner pinged per AUTONOMY-2/4); an identical call in the same batch or in a fresh verify-retry conversation gets the steer again, never the ask; thresholds are constants; a WATCH run that ends with a stuck ask, on any event type, is recorded for the bridge in the shared DB (one per thread, SAFE-6 scrubbed, replaced by a newer one, dropped by a later run that is not stuck) and the bridge DMs the owner on its scheduler tick with the thread link and the stuck-ask post; with no live bridge on the data dir, or no owner Discord id, one watch log line says the Discord ping could not be sent and the run summary comment still carries the question where WATCH posts one; tests/agent.loop-guards.test.ts and tests/watch.stuck-ask.test.ts fail on the base sources and pass on the branch

## No-spec Rationale

Not applicable
