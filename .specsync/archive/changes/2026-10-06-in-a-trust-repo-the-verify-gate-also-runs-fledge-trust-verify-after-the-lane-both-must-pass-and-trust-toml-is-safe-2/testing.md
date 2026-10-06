---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: testing
---

# Testing

- `bun test tests/agent.trust-verify.test.ts` (11 tests).
- Adjacent: `bun test tests/agent.verify-env.test.ts tests/agent.repo-ways.test.ts tests/files.plugins.test.ts tests/git.plugins.test.ts tests/agent.verify-gate.test.ts tests/agent.verify-feedback.test.ts tests/discord.send-file.test.ts`.
- Fail-on-base proof: with `src/agent/verify.ts`, `src/agent/repo-ways.ts`, `src/agent/loop.ts`, `src/agent/types.ts` and `plugins/files/protectedPaths.ts` from `origin/main` swapped in, 10 of the 11 new tests fail (the no-Trust regression guard passes on both); restored, all pass.
- Full `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `hi check` and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-525 | `tests/agent.trust-verify.test.ts` ("in a Trust repo the verify gate also runs fledge trust verify"): probe → lane → trust verify order and pass; failing trust step; an abort during the Trust step is a cancel (`verify lane aborted`); failing lane skips trust; unavailable `fledge trust` fails closed with the exact reason and no lane; `trustNote` on the failed and unavailable results; deleted / committed-away / start-scan-only `.trust.toml` still counts; no-Trust repo unchanged; ways and verifying lines; the reason leads the failure summary and the retry feedback (over-cap Trust output) |
| REQ-plugins-525 | `tests/agent.trust-verify.test.ts` (".trust.toml is SAFE-2 protected like fledge.toml"): `isProtectedPath`, files-write / files-edit / files-delete refusals, `discord-send-file` refusal, reads and look-alike names open, git-commit deletion refused |
| AGENT-18 (Trust clause) | both of the above |
