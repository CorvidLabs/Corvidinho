---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: tasks
---

# Tasks

- [x] `usesTrust(cwd)` over `detectRepoWays` and the run ledger; ways line no longer says the steps are not followed.
- [x] `defaultVerifyRunner`: probe, lane, then `fledge trust verify`; both must pass; exact fail-closed reason; shared `runFledgeStep`.
- [x] Verifying Text names the Trust step in a Trust repo.
- [x] `.trust.toml` SAFE-2 protected; refusal text lists it.
- [x] `tests/agent.trust-verify.test.ts` (stand-in fledge); fails on the base sources, passes after.
- [x] Specs REQ-agent-525 / REQ-plugins-525, testing notes, agent spec files list.
- [x] STATUS.md Trust row and docs/discord.md.
- [x] SpecSync approve and `change check --commit`; draft PR. Review and finalize follow after merge.
