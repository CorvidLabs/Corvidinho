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

- Soft Discord polish (#10–14), GitHub write plugins, autonomous mode (later PRs).

### REQ-cli-004

The CLI SHALL provide `plugins list` and `plugins run <name>` and honor `--non-interactive` / CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE; doctor SHALL report loaded plugin count.

Acceptance Criteria
- `corvidinho plugins list` exits 0 and shows github + meta commands.
- Doctor includes a plugins check with command count.

### REQ-cli-005

Help/STATUS/README SHALL document bot-VM allowlist file + env overlays, default-deny (empty = refuse), and that AlgoChat/wallet ACT is deferred until a wallet allowlist exists (ALLOW-4, WALLET-1..3).

Acceptance Criteria
- `corvidinho --help` mentions allowlist file/env vars.
- STATUS/README note how to set allowlists on the bot VM; wallets deferred.

### REQ-cli-006

The CLI SHALL expose `task run` with `--no-verify`, optional `--max-retries`, and `--json` TaskResult output so operators and bridges can exercise or skip the prove-before-done gate.

Acceptance Criteria
- `corvidinho task run --no-verify --json` exits 0 with verify_skipped.
- Help documents `task run` and `--no-verify`.


### REQ-cli-007

The CLI SHALL expose a thin `specsync` subcommand (`list|read|check|brief|coverage|change-list|ship-status`) that forwards to the SpecSync plugins for operator ergonomics (SPECSYNC-1/2/3/5).

Acceptance Criteria
- `corvidinho specsync list` exits 0 and prints registered modules.
- Help documents the `specsync` surface.
- `task run` Planning can load specs when a task description is provided (`--task`).


### REQ-cli-008

The CLI SHALL expose `discord bridge` to start the HEAR bridge and `--protocol-version` printing the wire protocol integer. Doctor SHALL note Discord token and allowlist go-live requirements without printing secret values.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1` and exits 0.
- `corvidinho discord bridge` without token exits non-zero with clean explanation.
- Help documents `discord bridge` and Discord env/allowlist vars.


### REQ-cli-1

The CLI SHALL export canonical markdown and plain attribution footers that link
to the Corvidinho repository and contain no account handles.

Acceptance Criteria

- The markdown and plain strings match the canonical repository URL exactly.
- Unit tests assert that neither string contains an `@` character.

### REQ-cli-2

`corvidinho attribution` SHALL print the canonical markdown footer and exit 0.

Acceptance Criteria

- The CLI output is exactly the markdown footer followed by a newline.
- The command exits with status 0.

### REQ-cli-watch-001

The CLI SHALL expose `corvidinho github watch` to start the poll loop and SHALL surface go-live checklist text on clean failure without printing secrets.

Acceptance Criteria
- Help lists `github watch`; missing token exits non-zero with checklist.

