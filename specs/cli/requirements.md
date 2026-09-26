---
spec: cli.spec.md
---

## User Stories

- As an operator on Linux, I want `corvidinho --help`, `version`, and `doctor` so I can confirm the CLI installs and see whether Discord, GitHub, Fledge, and SpecSync are usable without pasting secrets.

## Acceptance Criteria

### REQ-cli-001

`bun src/cli.ts --help` exits 0 and prints usage that names `corvidinho`, `doctor`, and `version`.

### REQ-cli-002

`bun src/cli.ts version` exits 0 and prints a semver string.

### REQ-cli-003

`bun src/cli.ts doctor` checks Discord token env presence, `gh auth status`, and whether `fledge` / `specsync` are on PATH, never printing secret values.


## Constraints

- Secrets stay out of repo and chat logs.
- Linux + Bun only for v1 bootstrap.

## Out of Scope

- Discord gateway, GitHub write plugins, autonomous mode (later PRs).

### REQ-cli-004

The CLI SHALL provide `plugins list` and `plugins run <name>` and honor `--non-interactive` / CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE; doctor SHALL report loaded plugin count.

Acceptance Criteria
- `corvidinho plugins list` exits 0 and shows github + meta commands.
- Doctor includes a plugins check with command count.

