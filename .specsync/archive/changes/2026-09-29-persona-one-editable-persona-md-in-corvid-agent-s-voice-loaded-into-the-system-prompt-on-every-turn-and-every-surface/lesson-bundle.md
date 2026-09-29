# Lesson bundle — persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Persona: one editable persona.md in corvid-agent's voice loaded into the system prompt on every turn and every surface, with the rules after it and winning (PERSONA-1..3, #69)
- **Kind**: Feature
- **Specs**: agent
- **Paths**: persona.md, src/agent/persona.ts, src/agent/execute.ts, src/agent/index.ts, src/agent/project-instructions.ts, tests/agent.persona.test.ts, README.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: One persona.md at the root of Corvidinho's own checkout (never the run's project folder) is read by createTaskExecute on every run, so every turn on every surface (Discord chat, slash commands, /work, schedules, WATCH, CLI task run, delegate and council workers) gets it fresh; it is read with the AGENT-1 loader rules (only the HEAD-committed copy in a git checkout, 8 KiB cap with a truncation marker, symlink out of the checkout / binary / non-UTF-8 refused, SAFE-6 scrubbed, the file cannot close its own <persona> label); the persona block comes first in the read-tier and tool-loop system prompts, labelled tone-only, and the PERSONA-3 rules text (one message per turn, no spam, no unchecked claims; the rules win) and Corvidinho's other rules always follow it, loaded or not, with project instructions after the rules; a missing, empty or refused file never stops a run: no persona block and one Text note naming only the file; a committed edit shows on the next run; the shipped persona.md carries corvid-agent's persona shape (archetype, traits, background, communication style, example messages) in a warm, direct voice with emoji and holds no secrets; no new flag, env var, config key, slash command, schema or package version change; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `e6d2cb2e0c47754a5a7a9384eeb3ab148064840e`
- Base commit: `303265df9506233c8b2b6f514ecf72d3f85d3035`
- Verified by: `specsync check --spec agent`

## From the change's context.md

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

## From the change's design.md

# Design

- **Where the file lives.** `persona.md` at the root of Corvidinho's own
  checkout: `CORVIDINHO_ROOT = import.meta.dir/../..` from
  `src/agent/persona.ts`, i.e. the checkout whose `src/cli.ts` is running.
  Bridges, WATCH and the daemon spawn that same bin, so every surface reads
  the same file; a run's project folder (`cwd`, a session worktree, another
  repo) never supplies it. No path override for operators (none was needed);
  `CreateTaskExecuteOpts.personaRoot` is a test seam.
- **How it is read.** `loadPersona(root)` calls
  `loadProjectInstructions(root, { fileNames: ["persona.md"], maxBytes: 8
  KiB, exactRoot: true })`. `exactRoot` skips `findProjectRoot`'s walk up to
  the nearest `.git`, so a parent repo never becomes the persona root. The
  rest is the AGENT-1 loader unchanged: HEAD-committed blob through
  read-only git in a git checkout (working-tree edits not loaded, untracked
  refused), working-tree read otherwise, UTF-8-safe cap with a marker,
  symlink / binary / non-UTF-8 refusal, SAFE-6 scrub, never throws.
- **When.** `createTaskExecute` loads it once per run. Every surface spawns a
  fresh `task run`, so every turn reads it again; verify retries in one run
  share the one load.
- **Prompt order (PERSONA-3).** Tool loop: `PERSONA_HEADER` +
  `<persona file="persona.md">…</persona>`, then "You are Corvidinho…",
  `PERSONA_RULES_SYSTEM_INSTRUCTIONS`, the MEMORY / IDENTITY / public Q&A /
  Discord chat / ask blocks and the finishing rules, then project
  instructions. Read tier: persona block, then the read-tier line and
  `PERSONA_RULES_SYSTEM_INSTRUCTIONS`, then project instructions. The header
  says the persona is tone only (not facts, tools or permissions) and the
  rules win; the rules text says the persona never overrides them. With no
  persona the prompt starts with "You are Corvidinho" and still carries the
  PERSONA-3 rules. A close tag in the file (`</persona`, any case or
  spacing) is escaped so the file cannot end its own block.
- **Notes.** `personaWarning` gives one `Text` event per run (like the
  AGENT-1 note) for a missing, empty, refused, truncated or uncommitted
  file, naming only `persona.md`, never a host path. A clean load adds no
  event, so ordinary event streams are unchanged.
- **Voice (PERSONA-1).** The shipped file uses corvid-agent's composed
  persona shape (`Archetype:`, `Personality traits:`, `Background:`,
  `Communication style:`, `Example messages (match this tone and style):`)
  and the finishing rule asks for "one concise plain-text message … in the
  persona's voice — never a flat changelog (PERSONA-1)" instead of "a
  concise plain-text summary of what you did".
- **Unchanged:** NDJSON protocol, spawn argv and env, the SpecSync briefing
  (user message), tool catalog, roles, verify gate, schema, package
  version. Templated bot posts that never reach the model (announce, status,
  error lines) keep their text.
- **Chosen conservatively (pending Leif):** the voice text itself is drafted
  in corvid-agent's shape (its live persona row was in its SQLite DB and is
  not reachable here); only the committed copy loads, so an edit needs a
  commit / PR, not a hand edit on the VM; no path override env var; PERSONA-3
  is enforced by prompt precedence on top of the existing code gates (the
  bridges' reply handling, DISCORD-6 rate limits, the verify gate), with no
  new code-level message limiter; templated posts are not rewritten in the
  persona voice.
- **Review follow-up (after main's #270).** DISCORD-17 lets the model post a
  file with `discord-send-file`, which is its own Discord message. The
  PERSONA-3 rule (a) now reads "your whole answer is one final reply; never
  split it across several posts or send extra chat messages through tools
  (attaching a file to the conversation when it helps is fine, DISCORD-17)",
  and the attach block sits after the persona like every other rule.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-069` (PERSONA-2) | `tests/agent.persona.test.ts` | "a committed persona.md loads into a labelled block with no note": `PERSONA_HEADER` + `<persona file="persona.md">` block, `personaWarning` null. |
| `REQ-agent-069` (PERSONA-2) | `tests/agent.persona.test.ts` | "no persona.md: no block, one note, never another directory's file" (a committed `persona.md` in a parent git checkout is not read) and "a plain checkout (no .git) inside a git parent reads its own working-tree file". Both fail with main's `project-instructions.ts` (it walks up to the parent's `.git`). |
| `REQ-agent-069` (PERSONA-2, SAFE-1) | `tests/agent.persona.test.ts` | "in a git checkout only the committed copy loads; the note says so" and "an untracked persona.md in a git checkout is refused, not loaded". |
| `REQ-agent-069` (SAFE-6, PERSONA-3) | `tests/agent.persona.test.ts` | "secrets are scrubbed and the file cannot close its own label": a `ghp_` token is gone, `</persona>` and `</ Persona >` are escaped, one real close tag. "an over-cap file is cut with a marker; an empty one gives no persona". |
| `REQ-agent-069` (PERSONA-2/3) | `tests/agent.persona.test.ts` | "tool loop and read tier: persona block, then the PERSONA-3 rules, then project instructions": mock provider, two attempts per tier; every system prompt starts with the persona header, has one `</persona>`, then the PERSONA-3 rules and "You are Corvidinho", then the project's AGENTS.md block; the run's project never supplies the persona; the finishing rule says "never a flat changelog (PERSONA-1)"; no note on a clean load. Fails on main (no persona in the prompt). |
| `REQ-agent-069` (PERSONA-2) | `tests/agent.persona.test.ts` | "each turn reads the file again: an edit shows on the next run": commit a new persona between two runs; the second prompt has only the new text. Fails on main. |
| `REQ-agent-069` (PERSONA-3) | `tests/agent.persona.test.ts` | "no persona file: the rules are still there and one note says why": prompt starts with "You are Corvidinho", carries the PERSONA-3 rules, exactly one `Persona: persona.md not found; this run has no persona (PERSONA-2)` event across two attempts. Fails on main. |
| `REQ-agent-069` (PERSONA-2) | `tests/agent.persona.test.ts` | "by default the persona comes from Corvidinho's checkout, whatever the run cwd": the prompt starts with the shipped block; a decoy `persona.md` in the cwd never loads. Fails on main. |
| `REQ-agent-069` (PERSONA-1) | `tests/agent.persona.test.ts` | "the shipped persona.md": `CORVIDINHO_ROOT` is this checkout and the file loads whole; it passes `scrubSecrets` unchanged; it has Archetype / Personality traits / Background / Communication style / Example messages, "corvid-agent", "warm", "direct", "Never a flat changelog voice", an emoji and "one message per turn". |
| `REQ-agent-069` (PERSONA-2, every surface) | `tests/agent.persona.test.ts` | End to end against a 127.0.0.1 fake provider, each with a decoy `persona.md` in the cwd: "CLI: corvidinho task run", "Discord: the spawn client chat, slash commands, /work and schedules share" (`createSpawnAgentClient` from src/discord, also used by the scheduler and the daemon), "WATCH: the GitHub spawn client", "delegate and council workers" (`runDelegateChild`, which council voices use). Every system prompt the provider sees starts with the shipped persona and has the PERSONA-3 rules after it. All four fail on main. |
| `REQ-agent-069` (PERSONA-3, DISCORD-17) | `tests/agent.persona.test.ts` | "a Discord run offered discord-send-file: the attach block is after the persona too, and one message per turn still allows an attachment": persona first, `Attachments (DISCORD-17)` after `</persona>`, and the one-message rule says never to split the answer or send extra chat messages through tools while allowing an attachment. Added in review after main's #270. |
| `REQ-agent-069` (PERSONA-2 editable) | `tests/agent.project-instructions.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.events-ndjson.test.ts` | Tests that assert a run's exact events pass `personaRoot` = `tests/fixtures/persona` (a plain folder, a clean load). Without it, an uncommitted edit to `persona.md` added a "working-tree changes not loaded" note to every run and 5 of them failed; with an extra line appended to `persona.md`, the whole suite now passes. |
| `REQ-agent-084` | `tests/agent.project-instructions.test.ts` | Unchanged and still green: the `exactRoot` option defaults off, so project instructions keep their root discovery and notes. |

Fail-on-main proof: with origin/main's `src/agent/execute.ts`,
`src/agent/index.ts` and `src/agent/project-instructions.ts` swapped in (the
new `src/agent/persona.ts` and `persona.md` kept so the file loads),
`tests/agent.persona.test.ts` runs 8 pass / 10 fail (the 10 marked above);
on main as it is (no `src/agent/persona.ts`) the file fails to load
("Cannot find module '../src/agent/persona.ts'"). Restored: 18 pass / 0 fail.

Full suite: `bun test`, `bunx tsc --noEmit`, `hi check`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
