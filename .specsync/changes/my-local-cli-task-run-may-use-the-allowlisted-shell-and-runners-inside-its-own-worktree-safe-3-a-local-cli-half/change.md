---
id: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
state: verifying
type: feature
base_commit: b84c75fc3e98ce9d51c30ea215f538d53c18ded8
---

# My local CLI task run may use the allowlisted shell and runners inside its own worktree (SAFE-3.a, local CLI half)

## Intent

My local CLI task run may use the allowlisted shell and runners inside its own worktree (SAFE-3.a, local CLI half)

## Affected Canonical Specs

- `cli`
- `agent`

## Acceptance Criteria

- SAFE-3.a (captured on main from Leif's 2026-09-28 interview; local CLI half, #83) holds: a local corvidinho task run that made its own linked worktree (SESSION-WORKTREE-1.a, REQ-cli-122) and has no role session is offered the allowlisted shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run at code tier, and they run there, because taskRun passes that worktree's top as createTaskExecute's talkWorktree (in-process, never from the env) and shellToolsGate grants a run with no role session only when it carries no Discord session id and no CORVIDINHO_ACTING_SURFACE stamp and its realpath cwd is exactly that worktree and a linked talk worktree whose git admin dir points back at it (isCliRunWorktree); --here (the checkout), a non-git folder, a repo subdirectory, any other directory, delegate or council workers (depth > 0), WATCH and schedule markers, and a spawn without a role session stay withheld, the model's call is refused as not offered, and one [operator] SAFE-3.a line per run says why (stderr in text mode, a Text event in --json / ndjson), never in the reply; a role session never uses talkWorktree; a granted prod command still raises the must-ask Approve card, and with no bridge running it lapses as a no and the run's output says why; tests/cli.safe3a-shell.test.ts fails on the base sources and passes on the branch; no new env var, flag, config key, table, schema or protocol change

## No-spec Rationale

Not applicable
