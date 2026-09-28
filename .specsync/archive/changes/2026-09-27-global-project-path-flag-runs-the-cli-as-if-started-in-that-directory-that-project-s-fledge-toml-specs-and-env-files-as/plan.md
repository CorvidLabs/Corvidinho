---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: plan
---

# Plan

1. Regression tests (`tests/cli.project-path.test.ts`) that fail on main.
2. `parseGlobalFlags` `project`; `readStartEnv`, `enterProject`,
   `ProjectDirError`, `PROJECT_ENV_TIMEOUT_MS` in `src/cli.ts`; wire into
   `main` before any command; help line.
3. Canonical spec: REQ-cli-505 in `specs/cli/requirements.md`, Public API /
   invariant / scenario / error rows and the new test in `files:` of
   `specs/cli/cli.spec.md`, `specs/cli/testing.md` entry.
4. Docs: README section, `.env.example` header (which `.env` Bun loads).
5. `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
