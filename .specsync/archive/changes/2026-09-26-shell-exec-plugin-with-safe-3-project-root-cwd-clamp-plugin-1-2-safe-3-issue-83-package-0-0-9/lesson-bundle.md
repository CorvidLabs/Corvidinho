# Lesson bundle — shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Shell-exec plugin with SAFE-3 project-root cwd clamp (PLUGIN-1/2 SAFE-3 issue #83) package 0.0.9
- **Kind**: Feature
- **Specs**: plugins, cli
- **Paths**: plugins/shell/, src/plugins/builtins.ts, tests/shell.plugins.test.ts, tests/plugins.list.smoke.test.ts, specs/plugins/, specs/cli/, package.json, src/version.ts, CHANGELOG.md, STATUS.md, docs/hi-drafts/WATCH-RELIABILITY.md
- **Acceptance**: shell-exec registered as typed dangerous plugin minTier=code (PLUGIN-1/2); pins spawn cwd to project root; refuses cd/pushd targets that lexically escape root including ~ $VAR bare-cd and .. (SAFE-3); SAFE-1 deny in non-interactive without allowlist; happy-path + escape fixture tests green; STATUS/CHANGELOG + package 0.0.9

## Evidence

- Verification commit: `bc38358362b1eea24a2d804a80c9ced380e747d6`
- Base commit: `ad431a9436108288cbe4c938d3e865da957458be`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

After files/search (#81 / package 0.0.6), STATUS P0 next is M3 plugins.
`hi/plugin.md` PLUGIN-1 lists **shell**; `hi/safe.md` SAFE-3 requires shell
commands cannot `cd` out of the project root. Issue #83 maps to shell cwd clamp.

Steal Merlin `fledge-plugin-shell` project-root clamp (#570): pin spawn cwd,
lexically refuse `cd`/`pushd` escapes before spawn. No new HI invented.

Also leave `docs/hi-drafts/WATCH-RELIABILITY.md` for Leif (WATCH summary after
ack / spawn outcome log / 403 backoff) — draft only, not `hi/` capture.

## From the change's design.md

# Design

- Always clamp to `ctx.cwd` (Corvidinho plugin cwd is already project/worktree);
  always set `CORVIDINHO_PROJECT_ROOT` in child env (parallel to Merlin env).
- Conservative lexer only (`; & | newline ()`); no claim to defeat `eval $(…)`.
- Exit 2 on SAFE-3 refuse (distinct from command non-zero exit).
- `dangerous: true` + minTier 2 so non-interactive dogfood needs allowlist.

## From the change's testing.md

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-086 | `tests/shell.plugins.test.ts` list markings + SAFE-1 deny; smoke `shell-exec` |
| REQ-plugins-087 | clamp unit cases + integration refuse `/tmp` and `cd ..`; allow `cd sub` |
| REQ-plugins-088 | builtins load; package 0.0.9; CHANGELOG/STATUS; hi-draft file |
| REQ-cli-015 | `bun src/cli.ts version` → 0.0.9 |

Commands: `bun test tests/shell.plugins.test.ts`, `bun test`, `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
