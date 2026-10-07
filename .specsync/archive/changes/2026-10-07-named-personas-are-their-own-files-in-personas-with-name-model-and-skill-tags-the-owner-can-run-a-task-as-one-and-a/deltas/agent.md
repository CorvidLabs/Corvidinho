---
module: agent
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
---

# Delta: agent (named persona files; run as one; a lead's delegate picks one by skill — AUTONOMOUS-2.a, AUTONOMOUS-5.a)

## Added

### REQUIREMENT REQ-agent-225

Named personas (AUTONOMOUS-2 / AUTONOMOUS-2.a, AUTONOMOUS-5 / AUTONOMOUS-5.a,
captured in this change's PR from Leif's 2026-09-28 interview, round 17 on
2026-10-07): "persona.md stays the default voice; each named persona is its
own file with its name, model, skill tags and voice in a personas folder."
and "I can run a task as a named persona, and a lead run picks a persona by
its skill tags; team members and the community can't pick personas."

`src/agent/personas.ts` SHALL read every `personas/*.md` file directly in the
`personas/` folder next to `persona.md` at Corvidinho's own checkout root
(`CORVIDINHO_ROOT`; `personaRoot` is a test seam), never the project a run
works in, with the persona loader and rules (REQ-agent-069 / REQ-agent-084):
`listInstructionDir` (`src/agent/project-instructions.ts`) lists the files
committed at `HEAD` and those in the working tree (dot files skipped, sorted,
at most `PERSONAS_MAX_FILES` = 32, the rest counted as `skipped`), and
`loadProjectInstructions(root, { exactRoot: true })` reads them: in a git
checkout only the committed copy (an untracked file refused as not committed,
a working-tree edit not loaded and flagged `uncommitted`), capped at
`PERSONA_MAX_BYTES`, symlinks out of the checkout and binary files refused,
SAFE-6 scrubbed. They SHALL be read again for every run.

- `parsePersonaFile` SHALL take `---` front matter with `name` (a short label
  `[a-z0-9][a-z0-9_-]{0,31}`, lowercased), `model` (one AGENT-13 `kind:model`
  entry, `parseModelEntry`; a list is refused) and `skills` (tags in `[a, b]`,
  `a, b` or a `- a` list, each a short label, lowercased, de-duplicated, at
  most 16; none is allowed), other keys ignored, then the voice (the text
  after the front matter, required). A file with no or unclosed front matter,
  a missing or bad name or model, a bad or excess tag, a repeated key or no
  voice SHALL be refused with one plain reason; a file whose name an earlier
  file (by file name) already uses SHALL be refused.
- `findPersona(set, name)` SHALL return the persona with that name, else one
  plain line: the named file's refusal (`personas/<name>.md refused: …`), else
  `Persona "<name>" not found in personas/ (named personas: …)`; every line
  ends `nothing was run (AUTONOMOUS-2.a)`.
- `personaForSkill(set, tag)` (AUTONOMOUS-5.a) SHALL return the first persona
  by name whose skill tags hold `tag` exactly (case-insensitive input), else
  null.
- `configuredModelEntries(env)` SHALL be the entries of
  `CORVIDINHO_LLM_MODEL` and each per-tier key (`_READ`, `_TOOL`, `_CODE`);
  `personaModelRefusal` SHALL refuse a persona whose model (same kind and
  model) is not one of them, naming the persona, its file and model label and
  the keys, never a key's value.
- `personaRunEnv(p, env, tier)` SHALL set the tier's model key to the
  persona's model followed by the tier's other configured models
  (`modelChainForTier`, the persona's own entry removed), every other key
  unchanged.
- `personaSkillsHint(set, env)` (AUTONOMOUS-5.a) SHALL be one line,
  `Named personas by skill tag: <name> (<tag>, …); …`, naming each persona
  (sorted by name) that has skill tags and a model `personaModelRefusal`
  accepts, labels only (never a voice, model or key), capped at
  `PERSONA_SKILLS_HINT_MAX` (400) characters; "" when there is none.

`createTaskExecute` SHALL accept `persona: { name, by: "owner" | "lead" }`.
With it the run SHALL resolve the persona once (`resolveRunPersona`) and use
`personaRunEnv` as the run's env, so the AGENT-11 fallback chain (with its
notice), the AGENT-10 no-provider notice and the SAFE-8 spend guard apply to
the persona's model like any configured model; an unpriced persona model's
spend ask names `the model in personas/<file>.md`. Its system prompts SHALL
start with `renderNamedPersona` (`NAMED_PERSONA_HEADER`, then the voice in a
`<persona file="personas/<file>.md" name="<name>">` block it cannot close
early; a quote, angle bracket or line break in the file name is shown as
`_`) instead of `persona.md`, with the PERSONA-3 rules after it, and a
truncated or uncommitted file SHALL get one `Persona: personas/<file>.md (…)`
note. Before anything else each attempt SHALL refuse, with one plain line as
its summary and `failureReason`, an error result and no model call:

- `by: "owner"` when the acting role (`resolveActingRole`) is neither null
  (the local CLI) nor `owner` — `PERSONA_OWNER_ONLY_LINE` (team members and
  the community can't pick personas);
- `by: "lead"` at delegation depth 0 (a lead's pick reaches only its worker);
- then an unknown persona, a refused file or an unconfigured model (the
  `resolveRunPersona` line).

`src/autonomous/delegate.ts` SHALL carry a lead's pick to its worker only
through `DELEGATE_PERSONA_ENV` (`CORVIDINHO_DELEGATE_PERSONA`): the worker
spawn env SHALL set it to the picked persona name, else delete it (never
inherited); `delegatePersonaFromEnv` SHALL read it only at depth > 0 and only
as a short label. The worker keeps every other limit (REQ-agent-117).

Acceptance Criteria
- Front matter in each list form parses; each bad shape is refused with its reason (`tests/agent.personas.test.ts`).
- A git checkout: committed files load, sorted by name; an untracked one is refused as not committed; a working-tree edit is not loaded and is flagged; a duplicate name, a bad file and dot / non-`.md` files are refused or skipped; a plain root reads its working tree; 34 files read 32 and skip 2.
- `findPersona`, `personaForSkill` (exact tag, ties to the first by name, none = null), `configuredModelEntries`, `personaModelRefusal` and `personaRunEnv` give the documented results.
- `personaSkillsHint` names only tagged personas with a configured model, in name order, without voice or model, and stops at 400 characters; a file name cannot break the `<persona>` label.
- Through `createTaskExecute` and a mock provider, at read and tool tier: the persona's model is called first with its voice and no `persona.md` text, the rules after it; its model failing falls back to the tier's next model with the AGENT-11 note; an unconfigured model or unknown persona is one line and no call; team and community role sessions get `PERSONA_OWNER_ONLY_LINE` and no call, the owner's role session runs; a lead's pick at depth 0 is refused and runs at depth 1; a working-tree edit is not loaded (one note) and a committed one shows on the next run.
- Fails on main's sources (the persona option is ignored) and passes on the branch.

## Modified

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
one message per turn, meaning the whole answer is one final reply, never
split across posts or sent as extra chat messages through tools, while a
DISCORD-17 file attachment stays allowed; no spam; no unchecked claims; the
persona never overrides these or any other rule in the prompt), whether or
not a persona loaded. The DISCORD-17 attach block (REQ-agent-476), when
present, SHALL also come after the persona block. Project instructions
(REQ-agent-084) SHALL stay after the rules. The finishing instruction SHALL
ask for one message in the persona's voice, never a flat changelog
(PERSONA-1). A missing, empty or refused persona file
SHALL NOT stop a run: the prompt has no persona block and one `Text` event
per run SHALL say why, naming only the file; a truncated file or a committed
copy with working-tree changes SHALL also get one note; a clean load SHALL
add no event. The shipped `persona.md` SHALL carry corvid-agent's persona
shape (`Archetype:`, `Personality traits:`, `Background:`,
`Communication style:`, example messages) in a warm, direct voice with
emoji, and SHALL hold no secret (it passes `scrubSecrets` unchanged). No
flag, environment variable, config key or slash command is added;
`CreateTaskExecuteOpts.personaRoot` is a test seam, not a product surface.

AUTONOMOUS-2.a (REQ-agent-225): `persona.md` stays the default voice. A run
the owner, or a lead's `delegate` for its worker, started as a named persona
(`CreateTaskExecuteOpts.persona`) SHALL NOT load `persona.md`; it SHALL use
that persona's own file from `personas/` in the same place, under
`NAMED_PERSONA_HEADER`, with the same rules after it. Every other run SHALL
load `persona.md` exactly as above. The `--persona` flag and the
`/session start` `persona` option that pick a named persona are REQ-cli-225 /
REQ-discord-225; `persona.md` itself still has no flag, env var, key or
command.

Acceptance Criteria
- A committed `persona.md` renders as `PERSONA_HEADER` plus a `<persona file="persona.md">` block, with no note.
- With no `persona.md` at the root there is no block and one note, and a committed `persona.md` in a parent git checkout is never read; a plain (non-git) root inside a git parent reads its own working-tree file.
- In a git checkout a working-tree edit is not loaded (the committed text is, with one "working-tree changes not loaded" note) and an untracked `persona.md` is refused as not committed.
- A token in the file is scrubbed and a `</persona>` or `</ Persona >` in it cannot close the block; an over-cap file is cut with a marker and a note; an empty file gives no persona and a note.
- Tool loop and read tier, on every attempt: the system prompt starts with the persona block, the PERSONA-3 rules and "You are Corvidinho" come after the block, and the project's AGENTS.md block comes after the rules; the finishing rule says "never a flat changelog (PERSONA-1)".
- A tool-loop run offered `discord-send-file` with a conversation channel: the persona block is first, the DISCORD-17 attach block comes after it, and the one-message rule says never to split the answer or send extra chat messages through tools while allowing an attachment.
- A committed edit to the persona shows on the next run and the old text is gone.
- No persona file: the prompt starts with "You are Corvidinho", still carries the PERSONA-3 rules, and exactly one "Persona: persona.md not found" note is emitted across attempts.
- By default the persona comes from Corvidinho's checkout: a decoy `persona.md` in the run's cwd never loads.
- The shipped `persona.md` loads whole from this checkout, passes `scrubSecrets` unchanged and carries the persona fields, "corvid-agent", "warm", "direct", "Never a flat changelog voice", an emoji and "one message per turn".
- End to end against a local fake provider, with a decoy `persona.md` in the cwd: `corvidinho task run`, the Discord spawn client (chat, slash commands, `/work` and schedules), the WATCH spawn client and a delegate worker (the council's worker path) each send a system prompt that starts with the shipped persona and has the PERSONA-3 rules after it.
- A run with no persona picked loads `persona.md` and calls the tier's first model as before; a run as a named persona has no `persona.md` text in its prompt and starts with `NAMED_PERSONA_HEADER` (`tests/agent.personas.test.ts`).
