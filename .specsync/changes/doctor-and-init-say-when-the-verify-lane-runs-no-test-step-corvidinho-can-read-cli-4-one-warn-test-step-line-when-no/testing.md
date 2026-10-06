---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "a verify lane that visibly runs no recognised test runner gets one [warn] test-step line in doctor and init; …": a lane reaching `npm test` (with a `node --test` dep), `bun run test`, `jest-junit && bun tests/run.ts` and spec-check gets exactly one `[warn] test-step` line in doctor (`All checks passed.`, exit 0) and in init (`Nothing missing …`, exit 0); no token, repo name or command from the file printed; dir listing unchanged; a lane with no spec-check and no runner gets the warn plus one `[missing] verify-lane` (exit 1 from the missing line only). On the base sources: no `test-step` line, so this test fails. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "no test-step line when a verify step runs a recognised runner …": this checkout (verify → test = `bun test`), the `bun test` fixture lane, `{ run = "cargo test" }`, a step task whose `deps` run `python -m pytest`, a `.fledge/lanes/verify.toml` lane running a `go test` task, `{ task }` on a string task running `npx vitest run`, a parallel `{ run }` running `./node_modules/.bin/jest`, and `sh -c 'bun  test'` print no `test-step` line (guards against false positives). |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | "with fledge.toml or [lanes.verify] absent or broken, the verify-lane [missing] line stands alone": empty dir, no `[lanes.verify]`, non-TOML `fledge.toml`, broken `.fledge/lanes/broken.toml` → the existing `verify-lane` `[missing]` line, no `test-step` line, exit 1. |
| `REQ-cli-430` | `tests/cli.doctor-truth.test.ts` | The existing project-file tests (missing / ok lines, lane spec-check variants, not-TOML, FIFO, subdirectory root hint) pass unchanged: the spec-check walk now goes through the shared `taskChainSome`. |

Fail-on-base proof: with origin/main's `src/doctor.ts` (8bf4422) swapped in,
tests/cli.doctor-truth.test.ts runs 31 pass / 1 skip / 1 fail — the new
warn test; restored: 32 pass / 1 skip / 0 fail (the skip is the existing
non-root read-only data-dir test). The two negative tests pass on both, as
guards.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100`, `hi check` and `fledge lanes run verify
--non-interactive`.
