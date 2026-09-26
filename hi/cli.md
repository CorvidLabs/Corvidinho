---
hi: 1
families: [CLI]
owner: leif
---

# CLI

## Intent

The Linux CLI is the product surface I trust when Discord is down. One binary should init a project, doctor the environment, run a task, drop into a REPL, or sit as a daemon — without sending me to a GUI.

## Criteria

- **CLI-1**  On Linux I can install a Corvidinho binary and run a one-shot prompt against the current directory.
- **CLI-2**  Bare invoke without a prompt drops me into an interactive REPL that uses the same agent loop as one-shot mode.
- **CLI-3**  `--non-interactive` runs without asking, and dangerous tools are denied unless I allowlisted them.
- **CLI-4**  `init` and `doctor` tell me what is missing (keys, Fledge, SpecSync, project files) in plain language instead of failing later mid-task.
- **CLI-5**  I can point it at another project path without `cd`, and it loads that project’s env and `fledge.toml`.
- **CLI-6**  I can resume a prior session by id or “most recent.”
- **CLI-7**  Output can be human text, a single JSON result, or a stream of events so bridges are first-class clients.
- **CLI-8**  A daemon mode keeps schedules and long autonomous work ticking without me babysitting a REPL.
- **CLI-9**  Keys, spend, audit, and diagnostics are subcommands I can run when something feels wrong, including a redacted support bundle.
