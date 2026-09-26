---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: testing
---

# Testing

New / changed tests (fixtures only, no network, no tokens):

- `tests/proc-group.test.ts`: stat parsing; synthetic tree walk (descendants,
  orphans in root group, recycled pids, never self / pid 1); real `sh` tree
  with same-group and `setsid` grandchildren killed; SIGTERM snapshot reaches
  an orphaned TERM-proof grandchild; tracked tree killed on parent exit and on
  unhandled SIGTERM (parent dies by SIGTERM); a parent's own SIGTERM or
  first-registered `once` SIGINT handler keeps its grace; hooks removed.
- `tests/fledge.hardening.test.ts`: `--` in argv; `--help/--json/--ni/--`
  reach the plugin (fake mimics fledge 1.8 help-eating); timeout kills
  same-group + `setsid` grandchildren and an orphan left holding the pipe;
  abort → 130 and tree killed; pre-aborted → nothing runs; two-root rebinding
  (origin + minTier follow the root, leftovers removed, other cwd refused and
  nothing run, reload rebinds); same plugin in two roots; failed discovery
  clears other roots; forced reload picks up an upgrade.
- `tests/autonomous.delegate.test.ts`: timeout and lead abort kill the
  worker's same-group and `setsid` grandchildren.
- `tests/scheduler.claim.test.ts`: `abandonInFlight` aborts the run's signal;
  failure counting uses `claimRun` (markRunStarted removed).
- `tests/daemon.test.ts`: real spawn client + fake `sh` bin; stop after the
  grace kills the run, its same-group and `setsid` grandchildren.
- `tests/fledge.plugins.test.ts` / `tests/fledge.cli.test.ts`: fakes consume
  one `--` like fledge; `tests/store.scrub.test.ts` uses `claimRun`.

Each new regression test was run against the pre-fix code and failed.
Commands: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage
100`, `specsync change audit`, `fledge lanes run verify --non-interactive`.
