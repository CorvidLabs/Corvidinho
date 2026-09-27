# Lesson bundle — project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Project-files preflight shared by doctor and a report-only init: doctor and a new report-only corvidinho init name a missing fledge.toml, verify lane with spec-check, .specsync/ and specs/ in plain language before task run fails on them mid-task (CLI-4)
- **Kind**: Feature
- **Specs**: cli
- **Paths**: src/doctor.ts, src/cli.ts, tests/cli.doctor-truth.test.ts, tests/docs.operator-facts.test.ts, README.md, docs/BOX-UPDATE.md, specs/cli/cli.spec.md, specs/cli/testing.md
- **Acceptance**: corvidinho doctor and a new report-only corvidinho init check the current dir's project files through one shared projectFilesDoctorChecks: fledge.toml (present, valid TOML), verify-lane ([lanes.verify] in fledge.toml or a .fledge/lanes/*.toml import runs spec-check: the defined spec-check task, a { task } / { run } / parallel step, or a task deps chain that runs specsync check), .specsync/ and specs/; each missing item prints one [missing] line in plain language naming what fails without it and, where Fledge / SpecSync has one, the command that creates it (fledge run --init, specsync init, specsync generate), and doctor / init exit 1; a complete project prints [ok] per item and doctor still passes in this checkout; init also prints the llm (warn without a key, never fails), fledge and specsync lines, creates and changes nothing, exits 0 when nothing is missing, and leaves Discord / GitHub keys and allowlists to doctor; file contents and parser messages are never printed (SAFE-6); no new flag, env var, config key, slash command, schema or package version change; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `fa5ed30efc792179ef990c8e9ba47e04a774e480`
- Base commit: `b89018f12d3fa6607edfd1acce69186267038302`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

HI: CLI-4 (hi/cli.md) — "`init` and `doctor` tell me what is missing
(keys, Fledge, SpecSync, project files) in plain language instead of failing
later mid-task."

Gap on main (b89018f): `corvidinho doctor` checks keys (Discord, GitHub,
WATCH, LLM), `fledge` / `specsync` on PATH, plugins, the allowlist file,
owner, the data dir and spend, but nothing about project files. Run in a dir
with no `fledge.toml`, `.specsync/` or `specs/`, it says nothing about
them, although `task run`'s prove-before-done gate runs
`fledge lanes run verify --non-interactive` in that dir (AGENT-4) and fails
there after the model has done the work. `corvidinho init` prints
`Unknown command: init` and exits 1.

`init` is named in the captured text, so a report-only `init` adds no
invented surface; scaffolding files stays out of scope. No open issue tracks
CLI-4.

Constraints: no new flag, env var, config key or slash command; no SQLite
schema or package version change; the existing doctor lines are unchanged
(`fledge` / `specsync` lines moved into a shared helper with the same
text). Commands named as creators were checked against the installed tools
(fledge 1.8.0: `fledge run --init` writes fledge.toml; specsync 6.0.0:
`specsync init` writes .specsync/, `specsync generate` scaffolds specs/).
No Fledge or SpecSync command creates a verify lane with spec-check
(`fledge lanes init` adds only `ci` / `check`), so that line says what to add.

## From the change's design.md

# Design

- One helper, `projectFilesDoctorChecks(cwd)` in `src/doctor.ts`, returns four
  `DoctorCheck` lines (`fledge.toml`, `verify-lane`, `.specsync`, `specs`);
  doctor and `init` both print them through the same `[mark] name: detail`
  printer, so the two commands cannot drift.
- The verify lane is read the way fledge 1.8.0 loads it: `fledge.toml` plus
  `.fledge/lanes/*.toml` imports (fledge.toml wins), steps as `"task"`,
  `{ task }`, `{ run }` or `{ parallel = [...] }`, and a task's `deps` run
  first. It counts as running spec-check when it reaches the defined
  `spec-check` task (the Merlin / Corvidinho convention `runSpecCheck` uses)
  or a command that runs `specsync check`. A lane naming an undefined
  `spec-check` task gets its own line (fledge fails the lane on it).
- `specs/` is the literal directory, as the SpecSync plugins read it
  (`plugins/specsync/api.ts`), not `specs_dir` from `.specsync/config.toml`.
- A missing item is `[missing]` and fails doctor (exit 1), like `fledge` /
  `specsync` not on PATH, because `task run`'s verify gate fails on it
  mid-task. **Pending Leif:** fail vs `[warn]` (warn would keep doctor's exit
  code for a dir that is not a project).
- `init` is report only: the `llm` line (the key `task run` uses; `warn`
  without one, never fails), `fledge`, `specsync`, then the project-file
  lines; creates and changes nothing; exit 1 only when an item is missing.
  Discord / GitHub keys and allowlists stay in doctor (init points there).
  **Pending Leif:** whether `init` should also list the Discord / GitHub key
  lines, and whether a later `init` may create the missing files.
- The current dir is checked (the dir `task run`, the bridge, WATCH and the
  daemon use as the project root); pointing at another path is CLI-5, not
  this slice.
- SAFE-6: a file that does not parse is named, never quoted; the TOML
  parser's message is dropped because it can echo the file.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "doctor in a dir without project files names each missing one and exits 1": doctor with every other check passing, run in an empty fixture dir, prints the four `[missing]` lines (`fledge.toml`, `verify-lane`, `.specsync`, `specs`) with reason and creator command, exactly four `[missing]`, exit 1, dir still empty. On main: no project-file line, exit 0. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "doctor in a complete project prints [ok] for each project item and passes" and "doctor in this checkout: its own fledge.toml, verify lane, .specsync/ and specs/ pass": four `[ok]` lines, `All checks passed.`, exit 0. On main: no such lines. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "init is report only: in an empty dir …": header `corvidinho init (report only — creates nothing)`, `[warn] llm`, `[ok] fledge` / `[ok] specsync` (stub bins), the four `[missing]` lines, no `discord:` line, the doctor pointer, exit 1, dir still empty. On main: `Unknown command: init`. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "init in a complete project with an LLM key exits 0 and says nothing is missing" (dir listing unchanged, key never printed) and "init names fledge and specsync missing from PATH". On main: `Unknown command: init`. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "the verify lane counts only when it runs spec-check …": eight fixture projects — no spec-check step (with an `echo specsync checked` decoy), no `[lanes.verify]`, undefined `spec-check` task → three distinct `[missing]` reasons; inline `{ run = "specsync check --strict" }`, `parallel`, `{ task = "spec-check", timeout }`, a `deps` chain to `specsync check`, and a lane imported from `.fledge/lanes/verify.toml` → `[ok]`. On main: `Unknown command: init`. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "a fledge.toml that is not TOML …": fledge.toml holding a token and a repo name then broken TOML fails `fledge.toml` and `verify-lane` naming the file, and neither value is printed; `.specsync` as a file is `[missing]` (not a directory); a broken `.fledge/lanes/broken.toml` import fails `verify-lane` naming it while `fledge.toml` stays `[ok]`. On main: no such lines. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | Review fixes: the verify-lane cases add a lane naming an undefined `lint` next to spec-check and a `spec-check` task whose `deps` name an undefined `build` (each `[missing]` naming the task), and `{ run }` steps calling `specsync check` by path and inside `sh -c '…'` (`[ok]`); the not-TOML test adds a FIFO `fledge.toml` (`[missing]`, no hang); "from a subdirectory of a git project …" runs init in `<project>/src` and gets the root hint on the `fledge.toml`, `.specsync` and `specs` lines (no creator command, nothing created), while a root lacking an item keeps its creator command. With the PR's first doctor.ts these fail (the FIFO case hangs until the 30 s timeout). |
| `REQ-cli-003` | `tests/cli.doctor-truth.test.ts`, `tests/docs.operator-facts.test.ts` | Existing doctor tests (allowlists, llm, data dir) pass unchanged from this checkout; docs/BOX-UPDATE.md names every doctor check that can fail an update, now including `fledge.toml`, `verify-lane`, `.specsync` and `specs`. |

Fail-on-main proof: with origin/main's `src/cli.ts` and `src/doctor.ts`
swapped in, tests/cli.doctor-truth.test.ts runs 16 pass / 1 skip / 8 fail —
the eight new tests above; the 16 existing tests pass. Restored: 24 pass /
1 skip / 0 fail (the skip is the existing non-root read-only data-dir test).

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/cli/context.md`
