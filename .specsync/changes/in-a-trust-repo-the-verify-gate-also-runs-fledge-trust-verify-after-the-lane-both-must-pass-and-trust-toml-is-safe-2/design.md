---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: design
---

# Design

- Detection reuses `detectRepoWays` (no fork): new `usesTrust(cwd)` in `src/agent/repo-ways.ts` is true when the start scan of the run in progress in `cwd` found Trust, or `detectRepoWays(cwd, base)` finds it now, with that run's base or, with no run (the `/work` pre-push re-verify), `repoWaysBase(cwd)`. A `.trust.toml` deleted or committed away mid-run or on the branch still counts.
- `defaultVerifyRunner` (`src/agent/verify.ts`): the spawn body becomes `runFledgeStep(fledge, args, cwd, signal)` (same verify env, own process group, pipe reading that feeds the idle watchdog, abort kills the tree), used for every step. In a Trust repo: probe `fledge --non-interactive trust --help` first (non-zero ⇒ fail closed with `trustUnavailableReason`, no lane), then the lane, then, only after a passing lane, `fledge --non-interactive trust verify`. Both must exit 0. A failing Trust step returns a one-line `Trust gate:` head plus its output; a passing one adds `TRUST_PASSED_LINE` after the lane's output, so the AGENT-15 evidence judge sees the lane's test summary once. No Trust ⇒ the lane alone, same argv and output.
- `src/agent/loop.ts`: the verifying Text names `fledge trust verify` when the start scan found Trust; the stale "Does not invent Trust/attest" comment is replaced.
- `plugins/files/protectedPaths.ts`: basename `.trust.toml` joins the SAFE-2 protected names (file tools, `git-commit` deletion staging, `discord-send-file`), and the refusal's list names it.
- Not changed: the hi guard, hi drafts, the SpecSync gate, CI, Corvidinho's own repo, any config, env var or schema.
