# Lesson bundle — fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Fledge core runs wait on SAFE-3 like the shell: fledge-lanes-run and fledge-run are never offered to the model from the task-run allowlist (SAFE3_PENDING_TOOLS), and allowlisting a Fledge core builtin does not start Fledge plugin discovery (PLUGIN-1, CLI-3, SAFE-1, SAFE-3 pending)
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/tools.ts, src/agent/execute.ts, tests/agent.allowlisted-dangerous.test.ts, specs/agent/requirements.md, specs/agent/agent.spec.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: tests/agent.allowlisted-dangerous.test.ts: SAFE3_PENDING_TOOLS is shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run; an allowlist naming all six plus files-delete at code tier offers files-delete and none of the six, while includeDangerous still offers the two Fledge core runs and editsFilesUnreported names them. A code-tier task run whose allowlist names the four Fledge core builtins offers only fledge-lanes-list and fledge-lanes-validate as fledge- tools, refuses the model's fledge-run call as not offered, starts no fledge process (no discovery, no run) and reports no unreportedEditTools. Both tests fail with the branch's previous tools.ts and execute.ts; the discovery half fails with only execute.ts reverted.

## Evidence

- Verification commit: `7438bce5125332e7d8ea711a868681b696744557`
- Base commit: `d36bb43a329a4bff19cffcfaccfe82c57996f8ea`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

#261 (merged, `f98e5d8`) put allowlisted dangerous tools in the task-run
catalog (CLI-3 / SAFE-1). It kept `shell-exec` and the node/python/cargo
runners out even when named (`SAFE3_PENDING_TOOLS`): each starts in the
project dir, which is not a clamp, and whether they can be kept inside the
project root is Leif's open SAFE-3 question.

#262 (this branch, written before #261 merged) adds the Fledge core builtins
(PLUGIN-1). `fledge-lanes-run` and `fledge-run` run whatever commands a lane
or task in the project's `fledge.toml` gives them, and `fledge-run` appends
the model's args to the task's command. #262 describes their gate as "the
same as for shell-exec and the runners" and lists "no SAFE-3 cd clamp
applies" as a leftover risk. #262 said task runs offered no dangerous tool at
all, which stopped being true once #261 merged. So an allowlist entry for
`fledge-run` would have put a shell-equivalent in the model's catalog while
`shell-exec` itself stays out.

Second, #261's `allowsFledge` starts Fledge plugin discovery (a `fledge
plugins list` / `plugins audit` spawn) for any allowlisted `fledge-*` name.
The four core builtins are registered with the other builtins and need no
discovery, but naming one (for example `fledge-lanes-list`) still spawned
fledge.

Scope: `src/agent/tools.ts`, `src/agent/execute.ts`, the test file, the
agent spec (REQ-agent-501 / REQ-agent-112 and prose) and
`docs/DISCORD-GO-LIVE.md`. `corvidinho plugins run` and `runPlugin` are
unchanged. #232 and #233 are not touched.

## From the change's design.md

# Design

- `SAFE3_PENDING_TOOLS` gets `fledge-lanes-run` and `fledge-run`. The doc
  comment says why: each starts in the project dir, which is not a clamp, and
  runs whatever commands the project gives it. `includeDangerous` (the test
  seam) still offers them, as it does the shell.
- `allowsFledge` skips the four `FLEDGE_CORE_COMMAND_NAMES` (imported from
  `plugins/fledge/core.ts`), so discovery only starts for an allowlisted
  Fledge plugin command. `workerEditsUnreported` uses the same helper, so a
  local run that allowlists only core builtins no longer flags every
  `delegate` as an unreported edit.
- Alternative not taken: leave the core runs offerable and rely on the SAFE-1
  allowlist alone. That would let an allowlist offer the model a
  shell-equivalent while `shell-exec` itself waits on SAFE-3, so it is not
  consistent with #261. When Leif decides SAFE-3, the set is the one place to
  change.

## From the change's testing.md

# Testing

`tests/agent.allowlisted-dangerous.test.ts`:

- "shell-exec, the node/python/cargo runners and the Fledge core runs are
  never offered from the allowlist (SAFE-3 pending)": the set is exactly the
  six names. An allowlist naming all six plus `files-delete` at code tier
  offers only `files-delete`. `includeDangerous` still offers both core
  runs, they are registered and dangerous, and `editsFilesUnreported` names
  them.
- "allowlisted Fledge core builtins: the runs stay out until SAFE-3 and no
  core name starts discovery (REQ-agent-501)": a code-tier task run with the
  four core builtins allowlisted offers only `fledge-lanes-list` and
  `fledge-lanes-validate` as `fledge-` tools. The model's `fledge-run`
  call is refused as not offered, the fake fledge records no call (no
  discovery, no run), `fledge-hello` is not registered, and
  `unreportedEditTools` is absent.

Fail-without-fix proof:

- With the branch's previous `tools.ts` and `execute.ts`: 16 pass, 2 fail
  (both new tests).
- With only `execute.ts` reverted: 17 pass, 1 fail (the discovery test).
- With the fix: 18 pass, 0 fail.

## Where these lessons go

- `specs/agent/context.md`
