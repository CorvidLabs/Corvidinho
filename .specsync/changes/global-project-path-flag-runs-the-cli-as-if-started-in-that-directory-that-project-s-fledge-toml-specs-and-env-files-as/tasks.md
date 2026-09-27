---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: tasks
---

# Tasks

- [x] Regression tests in `tests/cli.project-path.test.ts`; proved failing with main's `src/cli.ts` (missing exports; the 4 CLI cases fail on their own too) and passing on the branch.
- [x] `parseGlobalFlags` returns `project` (before `--` only; `""` without a path).
- [x] `readStartEnv`, `enterProject`, `ProjectDirError`, `PROJECT_ENV_TIMEOUT_MS`; `main` enters the project before any command; `cliErrorHint` uses the error's hint; help line.
- [x] Canonical spec: REQ-cli-505, `cli.spec.md` API / invariant / scenario / error rows and `files:` entry, `testing.md` entry.
- [x] Docs: README section, `.env.example` header.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
