---
id: the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took
state: implementing
type: bug_fix
base_commit: 635d6a9b6a32a7874e5b32a1400051c641729bd2
---

# The SAFE-3.a approved-prod-command test runs a stand-in kubectl first on PATH instead of the host's real one, which took 2.4-3.1 s on CI runners and once passed the 5 s test timeout

## Intent

The SAFE-3.a approved-prod-command test runs a stand-in kubectl first on PATH instead of the host's real one, which took 2.4-3.1 s on CI runners and once passed the 5 s test timeout

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- The SAFE-3.a approved test runs its prod command against a stand-in kubectl first on PATH: the stand-in records exactly one call (get pods) in the talk worktree and none in the main checkout, and the deny test records none; with a kubectl on the host PATH that takes 5.5 s (like the CI runner run that timed out) the file passes 20 of 20 under 4 concurrent copies with the approved test at 123-214 ms, where before the fix it failed 20 of 20 at the 5 s timeout; the full suite passes

## No-spec Rationale

Not applicable
