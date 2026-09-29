---
id: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
state: archived
type: feature
base_commit: 303265df9506233c8b2b6f514ecf72d3f85d3035
---

# Persona: one editable persona.md in corvid-agent's voice loaded into the system prompt on every turn and every surface, with the rules after it and winning (PERSONA-1..3, #69)

## Intent

Persona: one editable persona.md in corvid-agent's voice loaded into the system prompt on every turn and every surface, with the rules after it and winning (PERSONA-1..3, #69)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- One persona.md at the root of Corvidinho's own checkout (never the run's project folder) is read by createTaskExecute on every run, so every turn on every surface (Discord chat, slash commands, /work, schedules, WATCH, CLI task run, delegate and council workers) gets it fresh; it is read with the AGENT-1 loader rules (only the HEAD-committed copy in a git checkout, 8 KiB cap with a truncation marker, symlink out of the checkout / binary / non-UTF-8 refused, SAFE-6 scrubbed, the file cannot close its own <persona> label); the persona block comes first in the read-tier and tool-loop system prompts, labelled tone-only, and the PERSONA-3 rules text (one message per turn, no spam, no unchecked claims; the rules win) and Corvidinho's other rules always follow it, loaded or not, with project instructions after the rules; a missing, empty or refused file never stops a run: no persona block and one Text note naming only the file; a committed edit shows on the next run; the shipped persona.md carries corvid-agent's persona shape (archetype, traits, background, communication style, example messages) in a warm, direct voice with emoji and holds no secrets; no new flag, env var, config key, slash command, schema or package version change; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
