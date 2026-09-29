---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: testing
---

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
| `REQ-agent-084` | `tests/agent.project-instructions.test.ts` | Unchanged and still green: the `exactRoot` option defaults off, so project instructions keep their root discovery and notes. |

Fail-on-main proof: with origin/main's `src/agent/execute.ts`,
`src/agent/index.ts` and `src/agent/project-instructions.ts` swapped in (the
new `src/agent/persona.ts` and `persona.md` kept so the file loads),
`tests/agent.persona.test.ts` runs 8 pass / 10 fail (the 10 marked above);
on main as it is (no `src/agent/persona.ts`) the file fails to load
("Cannot find module '../src/agent/persona.ts'"). Restored: 18 pass / 0 fail.

Full suite: `bun test`, `bunx tsc --noEmit`, `hi check`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.
