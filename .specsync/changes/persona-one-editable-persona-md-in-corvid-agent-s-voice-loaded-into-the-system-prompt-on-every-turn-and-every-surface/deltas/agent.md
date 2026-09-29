---
module: agent
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
---

# Delta — agent (one persona file, loaded every turn, rules win)

## Added

### REQUIREMENT REQ-agent-069

Persona file (PERSONA-1/2/3, issue #69). Corvidinho's voice SHALL live in one
editable file, `persona.md`, at the root of Corvidinho's own checkout
(`CORVIDINHO_ROOT`, next to `package.json`), never in the project a run
works in. `createTaskExecute` SHALL load it on every run, so every turn on
every surface that reaches the model through `task run` (Discord chat, slash
commands, `/work`, schedules, WATCH, the CLI, delegate and council workers)
reads it again and a committed edit shows on the next run (PERSONA-2). It
SHALL be read with the AGENT-1 loader (REQ-agent-084) at exactly that root: a
`.git` in a parent directory SHALL NOT make the parent the root; in a git
checkout only the copy committed at `HEAD` SHALL be loaded (a working-tree
edit is not loaded and an untracked file is refused as not committed), so
the non-dangerous file tools cannot plant a persona for later runs; without
`.git` the working-tree file SHALL be read. The file SHALL be capped at
`PERSONA_MAX_BYTES` (8 KiB) with a truncation marker; a symlink out of the
checkout, a non-regular, binary or non-UTF-8 file SHALL be refused; the text
SHALL be SAFE-6 scrubbed; a close tag for its `<persona>` label in any case
or spacing SHALL be escaped so the file cannot end its own block.

In the read-tier and tool-loop system prompts the persona block SHALL come
first, under `PERSONA_HEADER` (tone and personality only: not a source of
facts, tools or permissions; the rules after it win), and Corvidinho's rules
SHALL follow it, including `PERSONA_RULES_SYSTEM_INSTRUCTIONS` (PERSONA-3:
one message per turn, no spam, no unchecked claims; the persona never
overrides these or any other rule in the prompt), whether or not a persona
loaded. Project instructions (REQ-agent-084) SHALL stay after the rules. The
finishing instruction SHALL ask for one message in the persona's voice,
never a flat changelog (PERSONA-1). A missing, empty or refused persona file
SHALL NOT stop a run: the prompt has no persona block and one `Text` event
per run SHALL say why, naming only the file; a truncated file or a committed
copy with working-tree changes SHALL also get one note; a clean load SHALL
add no event. The shipped `persona.md` SHALL carry corvid-agent's persona
shape (`Archetype:`, `Personality traits:`, `Background:`,
`Communication style:`, example messages) in a warm, direct voice with
emoji, and SHALL hold no secret (it passes `scrubSecrets` unchanged). No
flag, environment variable, config key or slash command is added;
`CreateTaskExecuteOpts.personaRoot` is a test seam, not a product surface.

Acceptance Criteria
- A committed `persona.md` renders as `PERSONA_HEADER` plus a `<persona file="persona.md">` block, with no note.
- With no `persona.md` at the root there is no block and one note, and a committed `persona.md` in a parent git checkout is never read; a plain (non-git) root inside a git parent reads its own working-tree file.
- In a git checkout a working-tree edit is not loaded (the committed text is, with one "working-tree changes not loaded" note) and an untracked `persona.md` is refused as not committed.
- A token in the file is scrubbed and a `</persona>` or `</ Persona >` in it cannot close the block; an over-cap file is cut with a marker and a note; an empty file gives no persona and a note.
- Tool loop and read tier, on every attempt: the system prompt starts with the persona block, the PERSONA-3 rules and "You are Corvidinho" come after the block, and the project's AGENTS.md block comes after the rules; the finishing rule says "never a flat changelog (PERSONA-1)".
- A committed edit to the persona shows on the next run and the old text is gone.
- No persona file: the prompt starts with "You are Corvidinho", still carries the PERSONA-3 rules, and exactly one "Persona: persona.md not found" note is emitted across attempts.
- By default the persona comes from Corvidinho's checkout: a decoy `persona.md` in the run's cwd never loads.
- The shipped `persona.md` loads whole from this checkout, passes `scrubSecrets` unchanged and carries the persona fields, "corvid-agent", "warm", "direct", "Never a flat changelog voice", an emoji and "one message per turn".
- End to end against a local fake provider, with a decoy `persona.md` in the cwd: `corvidinho task run`, the Discord spawn client (chat, slash commands, `/work` and schedules), the WATCH spawn client and a delegate worker (the council's worker path) each send a system prompt that starts with the shipped persona and has the PERSONA-3 rules after it.
