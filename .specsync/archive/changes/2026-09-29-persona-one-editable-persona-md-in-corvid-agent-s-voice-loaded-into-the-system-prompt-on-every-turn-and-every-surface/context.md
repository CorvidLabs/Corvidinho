---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: context
---

# Context

HI (captured in this PR from Leif's 2026-09-28 interview, commit 303265d,
`hi/persona.md`):

- PERSONA-1 "It sounds like corvid-agent: warm, direct, with personality and
  emoji, never a flat changelog voice."
- PERSONA-2 "Its persona is one editable persona file, loaded every turn on
  every surface."
- PERSONA-3 "Personality never overrides the rules: one message per turn, no
  spam, no unchecked claims."

Issue #69 (M1 "Knows everyone"). The interview answer was "capture
PERSONA-1/2/3 as written (one editable persona file loaded every turn on every
surface; rules win over personality)".

On main the agent's voice is a fixed string at the top of the tool-loop system
prompt ("You are Corvidinho, a Linux-first headless agent CLI…") and the
read tier's "Reply with a short plain-text summary only". The finishing rule
asked for "a concise plain-text summary of what you did", which is the flat
changelog voice PERSONA-1 rules out. `git grep -i persona` over src/ and
plugins/ finds no persona code. The nearest captured ids do not cover this:
AUTONOMOUS-2 is a named persona roster (out of scope per the issue, G45), and
MEMORY-2 "personality" notes are about people the agent knows.

Every surface reaches the model through one place: Discord chat, slash
commands, `/work` and schedules (src/discord/agent-client.ts), WATCH
(src/watch/agent-client.ts), delegate and council workers
(src/autonomous/delegate.ts, council.ts) all spawn `corvidinho task run`,
and `task run` (src/cli.ts) is the only caller of `createTaskExecute`, which
builds both system prompts. One load there covers every surface, and each
spawn is a fresh process, so each turn reads the file again.

Constraints: v1 is off-chain (no AlgoChat / wallet surface; the issue's
"AlgoChat" mention is Post-v1). No named roster, per-channel personas, voice
or TTS (issue non-goals). No new flag, env var, config key, slash command,
schema or package version change. #232 / #233 scope is untouched.
