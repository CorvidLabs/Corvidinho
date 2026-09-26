# Lesson bundle — plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH: plugin host + GitHub read + repo deny gate
- **Kind**: Feature
- **Specs**: plugins, cli
- **Paths**: src/, plugins/, tests/, specs/, tsconfig.json, package.json, STATUS.md, AGENTS.md, fledge.toml, .specsync/config.toml, .specsync/registry.toml, docs/, bun.lock
- **Acceptance**: Typed plugin host list/run with danger/minTier; SAFE-1 deny in non-interactive; github-pr-list/status/ci-status/issue-list read-only via gh JSON; GITHUB-6 requires --repo and honors DENY/ALLOW env; CLI plugins list/run + doctor count; bun test + fledge verify green; Spec Sync CI green

## Evidence

- Verification commit: `e937162943f54d5f539d5223cdbdc1e9e2f1b7bd`
- Base commit: `bfd880ea9645d1444aa4e4cc11e7fcded4c35eb8`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

WATCH slice after ORIGIN (#2) on main: typed GitHub read plugins + plugin host + SAFE-1 deny + GITHUB-6 repo deny gate + SpecSync SDD. CI remains Bun + SpecSync Action only (no Fledge in Actions). Local fledge verify is the agent gate.


## Lesson

Ancestor correction: GitHub plugin bodies use Octokit + GITHUB_TOKEN/GH_TOKEN, never shell `gh`.

## From the change's design.md

# Design

- In-process Map registry; `runPlugin` enforces dangerous∧nonInteractive∧¬allowlist → exit 2.
- Builtins authored under `plugins/`; loaded once via `loadBuiltins`.
- GitHub: thin `ghJson` wrapper; read-only (`dangerous: false`).
- SAFE-1 demo: `danger-ping` (`dangerous: true`).
- Allowlist: `CORVIDINHO_ALLOWLIST` comma/space-separated.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (deny-dangerous, plugins list smoke, github fixtures, GITHUB-6 gate)
- `bunx tsc --noEmit`
- `bun src/cli.ts plugins list`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive` (local agent gate; not in Actions)

## CI

- **ci** smoke: Bun install/test/typecheck only
- **Spec Sync**: CorvidLabs/spec-sync@v6 + `specsync change audit`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-001 | `tests/plugins.deny.test.ts` list markings; `tests/plugins.list.smoke.test.ts` |
| REQ-plugins-002 | `tests/plugins.deny.test.ts` + `tests/plugins.deny.cli.test.ts` |
| REQ-plugins-003 | `tests/plugins.list.smoke.test.ts` github-* names; `tests/github.fixture.test.ts` |
| REQ-plugins-004 | `tests/github.deny.test.ts` + `tests/github.deny.cli.test.ts` |
| REQ-cli-004 | `tests/plugins.list.smoke.test.ts` + doctor path in `src/cli.ts` exercised by list smoke |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
