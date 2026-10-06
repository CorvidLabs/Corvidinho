---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: plan
---

# Plan

1. `usesTrust(cwd)` in `src/agent/repo-ways.ts` over `detectRepoWays` and the run ledger; ways line wording.
2. `defaultVerifyRunner`: shared `runFledgeStep`, probe, lane, then `fledge trust verify`; exact fail-closed reason.
3. Verifying Text in `src/agent/loop.ts`.
4. `.trust.toml` in SAFE-2 `isProtectedPath` and its refusal text.
5. `tests/agent.trust-verify.test.ts` with a stand-in fledge; prove it fails on the base sources.
6. Specs (REQ-agent-525, REQ-plugins-525), STATUS.md (docs/discord.md in a follow-up once #348's change is archived).
