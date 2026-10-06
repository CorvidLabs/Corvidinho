---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: design
---

# Design

- One new line in `projectFilesDoctorChecks` (`src/doctor.ts`), so doctor
  and `init` print the same text: `[warn] test-step` right after
  `verify-lane`, `ok: true` with `mark: "warn"` like `people-github` and
  `verify-gate`, so it never changes either command's exit code.
- It reuses the verify-lane reader: `loadFledgeProject` (fledge.toml plus
  `.fledge/lanes/*.toml` imports, first definition wins), `laneStepParts`
  (`"task"`, `{ task }`, `{ run }`, `parallel` items) and the task `cmd`
  read and `deps` walk, now shared as `taskChainSome` (spec-check detection
  goes through it too, unchanged).
- Runner names come from `TEST_SUMMARY_RUNNERS` in
  `src/agent/test-evidence.ts` (the list the verify gate reads summaries
  for), so the warning and the gate cannot drift. A command counts when it
  names one at a command boundary (start, whitespace, `; & | (`, a quote or
  `/` before; no word char or `-` after), like the `specsync check` match:
  `bun test`, `./node_modules/.bin/jest`, `python -m pytest`,
  `sh -c 'bun test'` count; `npm test`, `bun run test`, `jest-junit`,
  `bun tests/x.ts` do not.
- Static detection: a wrapper (`npm test`, `make test`) may still print a
  recognised summary, so the line says "visibly" and only warns.
- No line when the project did not load (no / broken `fledge.toml` or
  import) or has no `[lanes.verify]`: the existing `verify-lane`
  `[missing]` line stands alone.
- Printed text is fixed: runner names from the constant, no task names or
  commands from the file (SAFE-6).

Design choices pending Leif:
- The line also prints when `[lanes.verify]` loads but `verify-lane` is
  `[missing]` for another reason (no spec-check, an undefined task): both
  are true and independent. Alternative: suppress it whenever
  `verify-lane` fails.
- Line name `test-step` (README's wording); no fix hint beyond naming the
  runners.
- Detection is name-based: an `echo pytest` step counts as a test step;
  a wrapper that does print a recognised summary still gets the warning.
