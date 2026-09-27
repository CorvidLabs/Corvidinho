---
id: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
state: implementing
type: bug_fix
base_commit: d36bb43a329a4bff19cffcfaccfe82c57996f8ea
---

# Fledge core runs wait on SAFE-3 like the shell: fledge-lanes-run and fledge-run are never offered to the model from the task-run allowlist (SAFE3_PENDING_TOOLS), and allowlisting a Fledge core builtin does not start Fledge plugin discovery (PLUGIN-1, CLI-3, SAFE-1, SAFE-3 pending)

## Intent

Fledge core runs wait on SAFE-3 like the shell: fledge-lanes-run and fledge-run are never offered to the model from the task-run allowlist (SAFE3_PENDING_TOOLS), and allowlisting a Fledge core builtin does not start Fledge plugin discovery (PLUGIN-1, CLI-3, SAFE-1, SAFE-3 pending)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- tests/agent.allowlisted-dangerous.test.ts: SAFE3_PENDING_TOOLS is shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run; an allowlist naming all six plus files-delete at code tier offers files-delete and none of the six, while includeDangerous still offers the two Fledge core runs and editsFilesUnreported names them. A code-tier task run whose allowlist names the four Fledge core builtins offers only fledge-lanes-list and fledge-lanes-validate as fledge- tools, refuses the model's fledge-run call as not offered, starts no fledge process (no discovery, no run) and reports no unreportedEditTools. Both tests fail with the branch's previous tools.ts and execute.ts; the discovery half fails with only execute.ts reverted.

## No-spec Rationale

Not applicable
