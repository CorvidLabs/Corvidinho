---
module: agent
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
---

# Delta — agent (Trust where the repo uses Trust: fledge trust verify after the lane (AGENT-18))

## Added

### REQUIREMENT REQ-agent-525

Trust where the repo uses Trust (AGENT-18, captured on main from Leif's
2026-09-28 interview: "It works each repo's own way: a SpecSync change where
the repo uses SpecSync; where it uses hi, it drafts criteria and asks before
capturing, never inventing them; and Trust where the repo uses Trust."; this
builds its Trust clause). `defaultVerifyRunner` (`src/agent/verify.ts`) SHALL
ask `usesTrust(cwd)` (`src/agent/repo-ways.ts`): true when the start scan of
the run in progress in `cwd` found `.trust.toml`, or when `detectRepoWays`
finds it now in the working tree, HEAD or the session base (that run's base,
else `repoWaysBase`), so a `.trust.toml` deleted or committed away during a
run or on a `/work` branch still counts. In such a repo it SHALL first ask
fledge whether it has a `trust` command (`fledge --non-interactive trust
--help`); a non-zero exit SHALL fail the verify closed, before the lane
runs, with the exact reason (`trustUnavailableReason`: `Trust gate: this repo
uses Trust (.trust.toml), but \`fledge trust\` is not available here
(\`fledge trust --help\` exited <code>: <its first output line>), so
\`fledge trust verify\` cannot run and the run is not verified (AGENT-18).
Nothing in the repo can fix this: the owner installs Trust for fledge on
this machine.`). Otherwise it SHALL run `fledge lanes run verify
--non-interactive` and, only when the lane passes, `fledge --non-interactive
trust verify` (`TRUST_VERIFY_ARGS`); the verify SHALL pass only when both
exit 0. A failing Trust step SHALL give `Trust gate: fledge lanes run verify
passed, but fledge trust verify failed (exit <code>), so the run is not
verified (.trust.toml, AGENT-18).` followed by that step's output; a passing
one SHALL add only `TRUST_PASSED_LINE` after the lane's output, so the
AGENT-15 test evidence is judged on the lane's own output once. Every fledge
step SHALL run with the same verify env (SAFE-6, `buildVerifyEnv`), its own
process group, pipe reading that feeds the idle watchdog (AGENT-12) and
abort handling (an abort is `verify lane aborted`) as the lane. A repo with
no `.trust.toml` in any of those trees SHALL run the lane alone with today's
argv and output. The ways line SHALL read `Trust (.trust.toml: verify also
runs fledge trust verify)` and, when the run's start scan found Trust, the
verifying line `Running fledge lanes run verify --non-interactive (includes
spec-check), then fledge trust verify (.trust.toml)…`. This applies wherever
`defaultVerifyRunner` runs (the `runTask` gate, its re-run after settling
its own SpecSync change, and `/work`'s pre-push re-verify). Corvidinho's own
repo has no `.trust.toml` and gets nothing Trust-related. No env var, config
key, flag, NDJSON field or schema.

Acceptance Criteria
- With a stand-in fledge on PATH (never the host's), a repo with `.trust.toml` runs the probe, the lane, then `trust verify` in that order, passes with the lane's output plus the passed line (one test summary), and the Trust step's env has no `GITHUB_TOKEN`.
- A failing `trust verify` after a passing lane fails with the `Trust gate:` head and the step's output; a failing lane runs no `trust verify`.
- A fledge with no `trust` command fails with exactly the unavailable reason and runs no lane.
- `.trust.toml` deleted from the working tree (HEAD has it), committed away on a branch (only the merge-base with `main` has it), or seen only in the run's start scan still runs the Trust probe.
- A repo without `.trust.toml` (a `trust.toml` or `docs/trust.md` do not count) runs only `lanes run verify --non-interactive` and returns the lane's output unchanged.
- `runTask` in a Trust repo emits the Trust ways line and the verifying line naming `fledge trust verify`.
- `tests/agent.trust-verify.test.ts` fails on the base sources (all but the no-Trust case) and passes after.
