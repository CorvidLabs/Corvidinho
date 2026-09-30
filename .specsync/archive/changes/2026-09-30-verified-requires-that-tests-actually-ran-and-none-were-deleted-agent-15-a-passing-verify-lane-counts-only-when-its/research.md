---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: research
---

# Research

- Sources: issue #85 (body and three progress comments), Leif's interview
  record `/home/user/coord/interview-2026-09-28.md` (round 2, round 12), the
  slice record `/home/user/coord/pr-verify-gate-2.json` and the verify-gate
  rows of `/home/user/coord/m34-defaults.md` (no summary fails closed with no
  opt-out; `.skip` / `.todo` / `.only`-silenced count as dropped; renames and
  moves keeping names are not deletions, a retitle is; the AGENT-15 checks
  are additive to the FLEDGE-3 lane and printed in the verify output and the
  retry feedback).
- Lane output: `defaultVerifyRunner` returns stdout then stderr. fledge 1.8
  prints its markers on stdout; `bun test` 1.4.2 prints ` N pass` / ` N skip`
  / ` N todo` / ` N fail` / `Ran N tests across M files. [..]` on stderr, so
  the summary is at the end of the joined output. Checked with a scratch
  project (`fledge lanes run verify` over `bun test`).
- Bun 1.4.2 runs only the `.only` tests of a file that has one, without
  `--only` (siblings are not even reported as skipped); in CI it errors.
- Summary shapes of jest (`Tests: … total`), vitest (`Tests  … (N)`),
  `cargo test` (`test result:` per binary), pytest (`N passed … in Xs`,
  `no tests ran`) and `go test` (`--- PASS:` with `-v`, else one `ok` line per
  package, `[no tests to run]`, `[no test files]`). Other runners have no
  reliable summary and fail closed.
- The #308 tracker already reads `HEAD`, status and a baseline commit with
  read-only `runGit`; `git ls-tree` and `git cat-file blob` read baseline test
  text without writing the index or objects. `resolveBase` gives /work the
  merge-base.
