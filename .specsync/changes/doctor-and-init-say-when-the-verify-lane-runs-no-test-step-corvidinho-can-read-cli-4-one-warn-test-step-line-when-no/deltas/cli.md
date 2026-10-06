---
module: cli
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
---

# Delta: cli (doctor / init warn when the verify lane visibly runs no recognised test runner, CLI-4 / AGENT-15)

## Modified

### REQUIREMENT REQ-cli-430

`corvidinho doctor` and `corvidinho init` SHALL say what the current
directory is missing as a project before `task run` fails on it mid-task
(CLI-4), through one shared check (`projectFilesDoctorChecks`) that prints
one line per item: `fledge.toml` (present and valid TOML), `verify-lane`
(the `verify` lane, from `fledge.toml` or a `.fledge/lanes/*.toml` import,
runs spec-check: a step or a task's `deps` chain reaches the defined
`spec-check` task or runs `specsync check`), `.specsync` and `specs`
(directories). Each missing item SHALL be a `[missing]` line in plain
language naming what fails without it and, where Fledge or SpecSync has one,
the command that creates it (`fledge run --init`, `specsync init`,
`specsync generate`) — or, when the current directory is below a git
project root that has the item, that root to run from instead — and SHALL
make the command exit 1. A verify lane whose steps (or a step task's `deps`)
name a task no `[tasks]` table defines SHALL be `[missing]` naming that task,
since fledge refuses to run it. When the `verify` lane loads but no command
it reaches (a step task's string form or `cmd`, that task's `deps`,
`{ run }`, `{ task }` or a `parallel` item, from `fledge.toml` or a
`.fledge/lanes/*.toml` import) names a runner from `TEST_SUMMARY_RUNNERS`
(`bun test`, jest, vitest, `cargo test`, pytest, `go test`; a name followed
by `.` or `:` is a file or script, not the runner), both commands
SHALL print one plain-language `[warn] test-step` line naming those runners
and saying that if the lane prints none of their summaries a run that
changes files is never verified (AGENT-15). The detection is static (a
wrapper such as `npm test` may still print a recognised summary), so that
line SHALL NOT change the exit code; when `fledge.toml` or `[lanes.verify]`
is absent or broken (not valid TOML, or `steps` fledge cannot load: none,
empty, not a list, or a step of no known shape) there SHALL be no
`test-step` line (the `verify-lane` line stands alone). A file that cannot be read or parsed, or
that is not a regular file (never opened), SHALL be named without printing
its contents or the parser's message (SAFE-6). `init` SHALL be report only: it prints the `llm`
line (`warn` with the no-provider notice when no model provider is usable,
AGENT-10 / REQ-cli-003; never failing), the `fledge` and `specsync` PATH
lines and the project-file lines, creates and changes nothing, exits 0 when
nothing is missing, and points to `corvidinho doctor` for Discord / GitHub
keys and allowlists. No new flag, env var, config key or slash command.

Acceptance Criteria
- In a directory with no project files, doctor (all other checks passing) prints `[missing]` for `fledge.toml`, `verify-lane`, `.specsync` and `specs` with the plain-language reason and creator command, and no other `[missing]` line; exits 1; creates nothing.
- In a complete project (and in this checkout) doctor prints `[ok] fledge.toml`, `[ok] verify-lane: [lanes.verify] runs spec-check`, `[ok] .specsync`, `[ok] specs` and still passes (exit 0).
- `corvidinho init` in an empty directory prints `corvidinho init (report only — creates nothing)`, `[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set.`, `[ok] fledge` / `[ok] specsync`, the four `[missing]` project lines, no Discord line, exits 1 and leaves the directory empty; in a complete project with a model and its key it prints `[ok] llm`, exits 0 and says nothing is missing; without `fledge` / `specsync` on PATH it prints `[missing] fledge` / `[missing] specsync`.
- The verify lane counts for a `"spec-check"` step, `{ task = "spec-check" }`, `{ run = "specsync check …" }`, a `parallel` item, a task whose `deps` run `specsync check`, and a lane imported from `.fledge/lanes/`; it is `[missing]` with its own reason when there is no `[lanes.verify]`, when no step runs spec-check (`echo specsync checked` does not count), when the lane names an undefined `spec-check` task, and when a step or a step task's `deps` names any other undefined task (named in the line) even if spec-check is present; `{ run }` counts `specsync check` by path (`/usr/local/bin/specsync check`) or quoted (`sh -c 'specsync check'`).
- A `fledge.toml` that is not TOML fails `fledge.toml` and `verify-lane` naming the file, never printing its text; a broken `.fledge/lanes/*.toml` import fails `verify-lane` naming that file; a `.specsync` that is a file is `[missing]` as not a directory; a `fledge.toml` that is a FIFO is `[missing]` without being opened (doctor does not block).
- Run from a subdirectory of a git project whose root has `fledge.toml`, `.specsync/` and `specs/`, each `[missing]` line names that root (`<root> (the project root) has it — run corvidinho there`) instead of `fledge run --init` / `specsync init`; an item the root lacks keeps its creator command.
- A verify lane whose steps reach only commands naming no recognised runner (`npm test`, `bun run test`, a `node --test` dep, `jest-junit`, `bun tests/…`, `bun test.ts`, `bun test:unit`, `jest.config.js`, `pytest.ini`) gets exactly one `[warn] test-step` line in doctor and in init, saying no `[lanes.verify]` step visibly runs a recognised test runner, naming `bun test`, jest, vitest, `cargo test`, pytest and `go test`, and that if the lane prints none of their summaries a run that changes files is never verified (AGENT-15); doctor still prints `All checks passed.` and exits 0, init prints `Nothing missing for task run in this project.` and exits 0; the file's text and values are never printed and nothing is created. Next to a `[missing] verify-lane` (no spec-check) the warn adds no failure.
- There is no `test-step` line for this checkout (verify → `test` = `bun test`), a lane with `{ run = "cargo test" }`, a lane whose step task has `deps` running pytest, a lane imported from `.fledge/lanes/` running `go test`, `{ task }` on a string task running vitest, a parallel `{ run }` running jest by path, `node node_modules/vitest/vitest.mjs run`, or `sh -c 'bun  test'`.
- With `fledge.toml` absent or not TOML, no `[lanes.verify]`, a broken `.fledge/lanes/*.toml` import, or a `[lanes.verify]` whose `steps` fledge cannot load (none, `[]`, a string, a lane that is not a table, a step of no known shape), the `verify-lane` `[missing]` line stands alone (no `test-step` line).
