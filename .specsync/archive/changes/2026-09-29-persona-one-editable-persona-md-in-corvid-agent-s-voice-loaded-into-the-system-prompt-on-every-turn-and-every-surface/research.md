---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: research
---

# Research

- corvid-agent (steal-from, issue #69): `server/process/persona-injector.ts`
  and `session-config-resolver.ts` resolve the agent's persona prompt and
  inject it at every session start. `server/db/personas.ts` composes it as
  `## Persona` with `Archetype:`, `Personality traits:`, `Background:`,
  `Communication style:` (voice guidelines) and `Example messages (match
  this tone and style):` with quoted lines; migration 099 made personas
  composable rows (archetype, traits, voice_guidelines, background,
  example_messages). The live corvid-agent persona row lived in its SQLite
  DB, not the repo, and no backup is reachable from this box, so the shipped
  `persona.md` keeps that exact shape and drafts the voice from PERSONA-1 and
  the issue's notes (`Agents/corvidagent.md`, `Feedback/Feedback.md`: one
  turn = one message; recaps with personality and emoji). The wording of the
  voice is pending Leif's confirmation.
- Merlin (`AGENT.md`, `crates/merlin-core/src/system_prompt.rs`): a persona
  file loaded into the system prompt. Corvidinho already has the same loader
  shape for AGENT-1 (`src/agent/project-instructions.ts`): HEAD-committed
  copy only in a git checkout, size cap with a UTF-8-safe truncation marker,
  symlink / binary / non-UTF-8 refusal, SAFE-6 scrub, never throws. Reusing
  it keeps the persona from becoming a system-prompt injection path that the
  non-dangerous file tools could plant (files-write can change the working
  tree without consent; changing HEAD needs a consented git-commit).
- `findProjectRoot` walks up to the nearest `.git`; for the persona the root
  is fixed (Corvidinho's checkout, `import.meta.dir/../..`), so the loader
  gains an `exactRoot` option rather than a second loader.
- `scripts/corvidinho-update.sh` updates the bot VM with
  `git checkout --force <ref>`, so a hand edit on the VM would not survive an
  update anyway; the committed copy is the one that ships.
- Precedence is not left to position alone: the persona goes first, the
  rules follow it, the persona's header says it sets tone only, and the
  rules text says the rules win whenever they conflict (PERSONA-3).
