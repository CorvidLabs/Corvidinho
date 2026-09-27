---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: testing
---

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
