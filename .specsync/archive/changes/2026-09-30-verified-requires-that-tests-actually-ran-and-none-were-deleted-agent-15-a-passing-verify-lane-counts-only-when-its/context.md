---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: context
---

# Context

Issue #85 (M3 "Real dev teammate"), slice verify-gate-2 of the M3/M4 plan.
AGENT-15 is captured on main ("The real git diff decides what changed, and
'verified' requires that tests ran and none were deleted."), confirmed as
written by Leif in the 2026-09-28 interview (round 2: "verified = real diff
+ tests ran + none deleted"). #308 (verify-gate-1) built the real-diff half,
AGENT-14 and AGENT-15.a; this change builds the tests-ran / none-deleted
half. Nothing new is captured in `hi/`.

What was wrong on main (156cfa9):

- A verify lane that exits 0 counted as verified whatever it ran: a lane with
  no test step, or whose tests were all skipped, said "verified".
- A run could delete a test, retitle it, turn it into `.skip` / `.todo` or
  silence it with `.only`, and the passing lane then called the change
  verified.
- /work trusted the run's `verified` (or a pre-push lane exit code) and
  pushed a branch whose earlier commits dropped tests.

Constraints: specs only through SpecSync; no new env var, config key, flag,
slash command, table, schema bump or NDJSON field; `src/plugins/run.ts`,
`src/plugins/must-ask.ts` and provider / tier code untouched (must-ask-gate
and providers-1 are in flight); #232/#233 scope untouched; REQ-agent-502's
non-git fail-closed rule kept. Conservative defaults come from
`/home/user/coord/m34-defaults.md` (slice verify-gate) and are listed in the
PR under "Design choices pending Leif".
