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
- [x] Review: a failed or unavailable Trust step's one-line reason travels as `VerifyResult.trustNote`; `runTask` leads the failure summary and retry feedback with it, so a long Trust output no longer pushes the head out of the 4000-char feedback (`src/agent/types.ts`, `src/agent/loop.ts`). `/work`'s rare pre-push re-verify still says "the verify lane failed" for a Trust failure: naming the reason there touches the discord module (`src/work/pr.ts`) and is a follow-up.
- [x] Review: the abort test aborts once `trust verify` has started (polls the stand-in's log), not after a fixed 1.5 s; `discord-send-file` refusing `.trust.toml` is asserted.
- [x] SpecSync approve and `change check --commit`; draft PR. Review and finalize follow after merge.
