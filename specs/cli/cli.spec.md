---
module: cli
version: 1
status: draft
files:
  - src/cli.ts

db_tables: []
depends_on: []
---

# Cli

## Purpose

User-facing entry point for Corvidinho. Bootstrap surface: `--help`, `version`, and `doctor`. No Discord or GitHub writes yet. Secrets are never printed.

## Public API

CLI surface — observable contract is the command grammar.

### Commands

| Command | Args | Description | Status |
|---------|------|-------------|--------|
| `corvidinho --help` / `-h` / `help` | none | Print usage and exit 0 | shipped |
| `corvidinho version` / `--version` / `-V` | none | Print semver and exit 0 | shipped |
| `corvidinho doctor` | none | Report Discord / GitHub / Fledge / SpecSync usability without printing secret values | shipped |

### Exported Functions

None — binary entry via `bun src/cli.ts` / package `bin`.

### Exported Types

None public beyond the process argv contract.

## Invariants

1. `--help`, `version`, and unknown-command help paths never read or print Discord/GitHub secret values.
2. `doctor` reports presence/absence of token env vars and CLI tools; when a token env is set it says so without echoing the value.
3. Successful `--help` and `version` exit with status 0; unknown commands exit non-zero after printing help.
4. Linux Bun/TS only; no desktop UI required to run these commands.

## Behavioral Examples

### Scenario: Help exits cleanly

- **Given** a checkout with Bun installed
- **When** the user runs `bun src/cli.ts --help`
- **Then** usage text containing `corvidinho` is printed and the process exits 0

### Scenario: Version prints semver

- **Given** a checkout with Bun installed
- **When** the user runs `bun src/cli.ts version`
- **Then** a `X.Y.Z` version string is printed and the process exits 0

### Scenario: Doctor without secrets

- **Given** no `DISCORD_TOKEN` / `DISCORD_BOT_TOKEN` and optional missing `gh` / `fledge` / `specsync`
- **When** the user runs `bun src/cli.ts doctor`
- **Then** each of discord, github, fledge, specsync is marked ok or missing with a non-secret detail line, and exit is non-zero if any check failed

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help, exit 1 |
| `gh` missing or `gh auth status` fails | doctor marks github missing, exit 1 if any check failed |
| Discord token env unset | doctor marks discord missing (does not invent a token) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| Bun runtime | `Bun.which`, `Bun.spawn`, process env |
| External CLIs | `gh`, `fledge`, `specsync` when present on PATH |

### Consumed By

| Module | What is used |
|--------|-------------|
| (none yet) | Bootstrap only |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-09-26 | corvid-agent | Bootstrap CLI stub: help, version, doctor |
