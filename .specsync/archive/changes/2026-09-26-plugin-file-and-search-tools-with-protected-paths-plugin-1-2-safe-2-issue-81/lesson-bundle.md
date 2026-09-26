# Lesson bundle — plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: PLUGIN file and search tools with protected paths (PLUGIN-1,2 SAFE-2 issue #81)
- **Kind**: Feature
- **Specs**: cli, plugins
- **Paths**: CHANGELOG.md, STATUS.md, package.json, plugins/files, plugins/search, specs/cli, specs/plugins, src/plugins/builtins.ts, tests/files.plugins.test.ts, tests/search.plugins.test.ts, tests/update-helpers.test.ts, tests/version.test.ts
- **Acceptance**: files-read/write/edit/glob/list and search-grep registered as typed plugins (PLUGIN-1); write/edit/delete declare minTier=code and delete is dangerous (PLUGIN-2); write/edit/delete refuse protected infra paths env/git/fledge.toml/specs/keystores (SAFE-2); paths clamped to project cwd with symlink escape refuse; happy-path + SAFE-2 deny tests green; STATUS/CHANGELOG updated; wired into builtins for LLM tool loop

## Evidence

- Verification commit: `844d9fe3a66db1103714269c2df6289353df4d2d`
- Base commit: `c20fc10318238468d1e6036a8f814759a31f7526`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #81 (M3): tool loop has no read/write/edit/glob/grep. Steal Merlin
`fledge-plugin-files` / `fledge-plugin-search` command shapes and corvid-agent
path clamp + protected-path refuse. HI already captures PLUGIN-1, PLUGIN-2,
SAFE-2 — no new criteria. Shell/git plugins out of scope.

## From the change's design.md

# Design

In-process Bun plugins (same host as memory/github). Shared `resolveProjectPath`
+ `isProtectedPath` used by write/edit/delete. Spec edits stay out of file tools
(SAFE-2); SpecSync plugins remain the path for specs. No shell/git in this slice.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (incl. `tests/files.plugins.test.ts`, `tests/search.plugins.test.ts`, version/update-helpers)
- `bunx tsc --noEmit` / `fledge lanes run verify --non-interactive`
- `specsync check`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-081 | plugins list + minTier/dangerous markings in files.plugins / search.plugins / list smoke |
| REQ-plugins-082 | path escape / symlink fixture refuses in files.plugins.test.ts |
| REQ-plugins-083 | write/edit/delete against .env, fledge.toml, specs, keystore refuse; file unchanged |
| REQ-plugins-084 | builtins load; happy read/write/edit/glob/grep; STATUS/CHANGELOG |
| REQ-cli-013 | package.json 0.0.6; version.test.ts; CHANGELOG 0.0.6 section; STATUS #81 done |

## Where these lessons go

- `specs/cli/context.md`
- `specs/plugins/context.md`
