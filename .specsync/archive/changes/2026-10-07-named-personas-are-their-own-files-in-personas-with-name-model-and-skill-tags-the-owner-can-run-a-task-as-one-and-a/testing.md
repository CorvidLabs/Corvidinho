---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: testing
---

# Testing

`tests/agent.personas.test.ts` (24 tests) and `tests/discord.session-persona.test.ts`
(5 tests). Temp dirs, local git repos as the persona checkout (`personaRoot` /
`SlashContext.personaRoot` / `DelegateCommandDeps.personaRoot`), a mock provider
(`fetchImpl`), sh fake bins for the delegate worker and the Discord spawn client, and
the real CLI spawned with only the env each case sets (its `127.0.0.1:9` model URL is
never called on a refused run). The SAFE-2 case runs the file tools with cwd at this
checkout and cleans up any probe file. Every run used a private `TMPDIR`.

Fail-on-base proof: with main's (`85871fa4`) `src/agent/execute.ts`, `src/cli.ts`,
`src/autonomous/delegate.ts`, `plugins/autonomous/commands.ts`,
`plugins/files/commands.ts`, `plugins/files/protectedPaths.ts`,
`src/discord/command-handlers/session.ts`, `src/discord/slash-commands.ts`,
`src/discord/slash-types.ts` and `src/discord/agent-client.ts` swapped in (the new
`src/agent/personas.ts` and its two loader helpers, `listInstructionDir` and
`personaBlock`, kept so the files load), the two files gave 8 pass, 19 fail: every
run-as-a-persona, CLI, delegate, SAFE-2 and Discord case fails (main ignores the persona
option, the flag, the env pick, the skill routing and the slash option, and the file
tools write into `personas/`); the 8 that pass are the parser / loader / lookup units of
the kept module. Restored: 27 of 27 pass, and the related suites (`agent.persona`,
`autonomous.*`, `files.*`, `agent.project-instructions`, `cli.*`, `discord.slash`,
`discord.session-worktree`) pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("front matter: name, model, skill tags …", "bad files are refused …") | Inline, comma and `- ` list skills; quoted values; lowercased name and tags; `ollama:qwen3:30b`; no tags allowed. Each bad shape (no or unclosed front matter, no or bad name, no model, a model list, a bad tag, 17 tags, no voice, a repeated key) gets its reason. |
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("loaded like persona.md …", "a plain (non-git) root …") | Committed files load sorted by name; an untracked file is refused as not committed; a working-tree edit is not loaded and flagged; a duplicate name and a file with no front matter are refused; dot and non-`.md` files skipped; a plain root reads its working tree; 34 files read 32, skip 2; no folder = empty set. |
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("findPersona …", "personaForSkill …", "the model must be one I configured …", "the voice block …") | Lookup by name (trimmed, any case); a refused file's line; the not-found line listing names; a non-label name refused. Exact tag, ties to `alpha` over `zeta`, no prefix match, none = null. Configured entries from the general and per-tier keys; the refusal line for a model only configured under another kind; the run env's tier key is the persona model then the tier's others. One `</persona>` only. |
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("the owner's pick …", "its model failing falls back …", "an unconfigured model, an unknown persona …") | Read and tool tier: `persona-model` called first, `NAMED_PERSONA_HEADER` and the voice, no `persona.md` text, rules after the block; no pick = `base-model` and `persona.md`. A 500 from the persona model → `base-model` with the fallback note. Unconfigured model and unknown persona: error result, the line as summary and `failureReason`, no request. |
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("team and community can't pick a persona …", "a lead's pick reaches only a delegate worker …", "a committed edit shows …") | Team and community role sessions: `PERSONA_OWNER_ONLY_LINE`, no request; the owner's role session runs. A lead pick at depth 0 refused; at depth 1 the persona model and voice. A working-tree edit not loaded with one note; committed, it shows on the next run. |
| `REQ-agent-069` | `tests/agent.personas.test.ts` ("the owner's pick …"); `tests/agent.persona.test.ts` | With no pick `persona.md` loads as before (all persona.md cases still pass); a named persona run carries no `persona.md` text. |
| `REQ-cli-225` | `tests/agent.personas.test.ts` ("task run --persona …" describe, 4 tests) | Unknown persona: exit 1, the not-found line, no model call; `--persona` with no name: exit 1, `--persona needs a name`; a community role session: `PERSONA_OWNER_ONLY_LINE`; `CORVIDINHO_DELEGATE_PERSONA` reaches a depth-1 run and is ignored at depth 0. |
| `REQ-plugins-225` | `tests/agent.personas.test.ts` ("delegate --skill routes to a persona" describe, 3 tests) | `--skill review` → worker env `CORVIDINHO_DELEGATE_PERSONA=alpha`, `data.persona` `alpha`, label `[review → persona alpha]`; `--skill docs` and no skill → `UNSET` even with the lead's env holding one, `data.persona` null; an unconfigured match refused, no worker. |
| `REQ-agent-225` | `tests/agent.personas.test.ts` ("the voice block …", "a lead's hint names each usable persona's skill tags …") | A file name holding `">`, `</persona>` and line breaks shows as `_` in the label and cannot add a second `</persona>`. `personaSkillsHint`: `alpha (review); zeta (review, docs)` in name order; an untagged persona and one whose model is not configured are left out; no voice or model text; "" with none; 30 personas cut at 400 characters. |
| `REQ-plugins-225` | `tests/agent.personas.test.ts` ("the lead's delegate tool lists the personas it can pick …") | The `delegate` description ends with `Named personas by skill tag: alpha (review); zeta (review).` and never names `rogue` (unconfigured model); with no `personas/` it has no persona line. |
| `REQ-plugins-225` | `tests/agent.personas.test.ts` ("write, edit and delete under the live personas/ folder are refused …") | cwd = this checkout: `files-write` (relative and absolute), `files-edit`, `files-delete` of `personas/<probe>` → `refused (SAFE-2)`, nothing written; `files-write personas/x.md` in another project succeeds. |
| `REQ-discord-225` | `tests/discord.session-persona.test.ts` (5 tests) | Options `topic`, `project`, `persona` (optional STRING); team and community → exactly `PERSONA_OWNER_ONLY_LINE` ephemeral, no run, no session; the owner's unknown or unconfigured persona → its line ephemeral, no run, no session; the owner's `Reviewer` → `runChat` gets `reviewer`, answer says `Persona: reviewer`; no pick → unset, no line; spawn argv `--persona reviewer` before `--task`, none when unset. |

Gates: `specsync change check --commit`, `specsync change audit`,
`specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
`bun test`, `fledge lanes run verify --non-interactive`.
