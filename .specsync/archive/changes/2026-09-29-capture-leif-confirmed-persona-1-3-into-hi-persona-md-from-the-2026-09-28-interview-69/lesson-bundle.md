# Lesson bundle — capture-leif-confirmed-persona-1-3-into-hi-persona-md-from-the-2026-09-28-interview-69

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif-confirmed PERSONA-1..3 into hi/persona.md from the 2026-09-28 interview (#69)
- **Kind**: Documentation
- **Paths**: hi/persona.md, INTENT.md, AGENTS.md, STATUS.md
- **Acceptance**: hi/persona.md holds PERSONA-1, PERSONA-2 and PERSONA-3 with Leif's confirmed text verbatim (owner leif, intent citing #69 and the 2026-09-28 interview); INTENT.md indexes the persona family; AGENTS.md and STATUS.md list the persona family (19 families); hi check passes

## Evidence

- Verification commit: `e6d2cb2e0c47754a5a7a9384eeb3ab148064840e`
- Base commit: `8e020976d94c10e9dcf905d1e2814e07bc37d3d8`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Leif's 2026-09-28 interview (Round 7) answered issue #69: "capture
PERSONA-1/2/3 as written (one editable persona file loaded every turn on
every surface; rules win over personality)". Round 11 set the execution
rule: each feature PR captures its ids with `hi`, then builds.

Captured with the `hi` CLI in commit 303265d (the family file comes from
the id prefix), before any code:

- PERSONA-1 "It sounds like corvid-agent: warm, direct, with personality and
  emoji, never a flat changelog voice."
- PERSONA-2 "Its persona is one editable persona file, loaded every turn on
  every surface."
- PERSONA-3 "Personality never overrides the rules: one message per turn, no
  spam, no unchecked claims."

The intent paragraph quotes Leif's planning answer from the issue ("like
corvid-agent was. Bring back its original voice", G9). `hi` added the
INTENT.md index line. `tests/docs.operator-facts.test.ts` requires AGENTS.md
to name every `hi/` file, so its family list gains `persona`, and the
STATUS.md HI row now counts 19 families (what `hi check` reports). The
build is the separate persona feature change in the same PR
(REQ-agent-069).

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
