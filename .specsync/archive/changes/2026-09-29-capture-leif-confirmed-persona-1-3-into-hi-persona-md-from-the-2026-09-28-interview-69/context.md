---
change: capture-leif-confirmed-persona-1-3-into-hi-persona-md-from-the-2026-09-28-interview-69
artifact: context
---

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
