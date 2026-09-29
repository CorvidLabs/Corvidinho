---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: requirements
---

# Requirements

HI: PERSONA-1, PERSONA-2, PERSONA-3 (`hi/persona.md`, captured in this PR
from Leif's 2026-09-28 interview).

- REQ-agent-069 (added): one `persona.md` at the root of Corvidinho's own
  checkout, loaded by `createTaskExecute` on every run (so every turn on
  every surface), through the AGENT-1 loader at exactly that root
  (HEAD-committed copy only in a git checkout, 8 KiB cap, refusals, SAFE-6
  scrub, close tag escaped); persona block first in the read-tier and
  tool-loop system prompts, Corvidinho's rules and the PERSONA-3 rules text
  after it whether or not it loaded, project instructions after the rules;
  the finishing rule asks for one message in the persona's voice, never a
  flat changelog; a persona problem never stops a run and gives one note;
  the shipped file carries corvid-agent's persona shape and voice and no
  secret; no flag, env var, config key or slash command.

Unchanged: REQ-agent-084 (project instructions keep their root discovery,
HEAD-only rule, cap and notes; the loader only gains an `exactRoot` option
the persona uses), REQ-agent-010 / REQ-agent-312 / REQ-agent-044 (their
system-prompt instruction blocks are still in the prompt, after the persona),
REQ-agent-112 (the SpecSync briefing stays in the user message).
