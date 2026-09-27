---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: testing
---

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
