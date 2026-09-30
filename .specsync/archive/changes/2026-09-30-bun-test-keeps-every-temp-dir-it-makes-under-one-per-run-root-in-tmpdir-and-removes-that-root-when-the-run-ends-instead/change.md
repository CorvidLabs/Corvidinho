---
id: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
state: archived
type: bug_fix
base_commit: 5093b81f1d8a10582b216c6116d1cfd83db331c7
---

# Bun test keeps every temp dir it makes under one per-run root in TMPDIR and removes that root when the run ends, instead of leaking ~500 mkdtemp dirs into /tmp per run (verify lane filled the agent box's disk)

## Intent

bun test keeps every temp dir it makes under one per-run root in TMPDIR and removes that root when the run ends, instead of leaking ~500 mkdtemp dirs into /tmp per run (verify lane filled the agent box's disk)

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- A full bun test run (and the fledge verify lane that runs it) leaves no new entries in the TMPDIR it started with: every temp dir the suite, its test files (including tmpdir() read at module top level) and the CLIs and shells they spawn without an explicit env make lands under one corvidinho-test-run-* root the preload creates in that TMPDIR, the preload's scratch data dir included; the root is removed when the run ends, also when a test fails (exit 1, failure still reported) and when a test calls process.exit() (exit code kept); cleanup never throws or changes a run's result; no new env var, config key or command

## No-spec Rationale

Not applicable
