---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: design
---

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
