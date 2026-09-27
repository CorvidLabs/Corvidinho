---
module: cli
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
---

# Delta — cli (project-files preflight shared by doctor and a report-only init)

## Added

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
since fledge refuses to run it. A file that cannot be read or parsed, or
that is not a regular file (never opened), SHALL be named without printing
its contents or the parser's message (SAFE-6). `init` SHALL be report only: it prints the `llm`
line (`warn` without a key, never failing), the `fledge` and `specsync` PATH
lines and the project-file lines, creates and changes nothing, exits 0 when
nothing is missing, and points to `corvidinho doctor` for Discord / GitHub
keys and allowlists. No new flag, env var, config key or slash command.

Acceptance Criteria
- In a directory with no project files, doctor (all other checks passing) prints `[missing]` for `fledge.toml`, `verify-lane`, `.specsync` and `specs` with the plain-language reason and creator command, and no other `[missing]` line; exits 1; creates nothing.
- In a complete project (and in this checkout) doctor prints `[ok] fledge.toml`, `[ok] verify-lane: [lanes.verify] runs spec-check`, `[ok] .specsync`, `[ok] specs` and still passes (exit 0).
- `corvidinho init` in an empty directory prints `corvidinho init (report only — creates nothing)`, `[warn] llm`, `[ok] fledge` / `[ok] specsync`, the four `[missing]` project lines, no Discord line, exits 1 and leaves the directory empty; in a complete project with an LLM key it exits 0 and says nothing is missing; without `fledge` / `specsync` on PATH it prints `[missing] fledge` / `[missing] specsync`.
- The verify lane counts for a `"spec-check"` step, `{ task = "spec-check" }`, `{ run = "specsync check …" }`, a `parallel` item, a task whose `deps` run `specsync check`, and a lane imported from `.fledge/lanes/`; it is `[missing]` with its own reason when there is no `[lanes.verify]`, when no step runs spec-check (`echo specsync checked` does not count), when the lane names an undefined `spec-check` task, and when a step or a step task's `deps` names any other undefined task (named in the line) even if spec-check is present; `{ run }` counts `specsync check` by path (`/usr/local/bin/specsync check`) or quoted (`sh -c 'specsync check'`).
- A `fledge.toml` that is not TOML fails `fledge.toml` and `verify-lane` naming the file, never printing its text; a broken `.fledge/lanes/*.toml` import fails `verify-lane` naming that file; a `.specsync` that is a file is `[missing]` as not a directory; a `fledge.toml` that is a FIFO is `[missing]` without being opened (doctor does not block).
- Run from a subdirectory of a git project whose root has `fledge.toml`, `.specsync/` and `specs/`, each `[missing]` line names that root (`<root> (the project root) has it — run corvidinho there`) instead of `fledge run --init` / `specsync init`; an item the root lacks keeps its creator command.
