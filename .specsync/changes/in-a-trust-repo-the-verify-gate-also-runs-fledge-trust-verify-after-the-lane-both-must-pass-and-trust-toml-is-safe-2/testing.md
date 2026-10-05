---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: testing
---

# Testing

- `bun test tests/agent.trust-verify.test.ts` (9 tests).
- Adjacent: `bun test tests/agent.verify-env.test.ts tests/agent.repo-ways.test.ts tests/files.plugins.test.ts tests/git.plugins.test.ts tests/agent.verify-gate.test.ts tests/agent.verify-feedback.test.ts tests/discord.send-file.test.ts`.
- Fail-on-base proof: with `src/agent/verify.ts`, `src/agent/repo-ways.ts`, `src/agent/loop.ts` and `plugins/files/protectedPaths.ts` from `origin/main` swapped in, 8 of the 9 new tests fail (the no-Trust regression guard passes on both); restored, all 9 pass.
- Full `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `hi check` and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-525 | `tests/agent.trust-verify.test.ts` ("in a Trust repo the verify gate also runs fledge trust verify"): probe → lane → trust verify order and pass; failing trust step; failing lane skips trust; unavailable `fledge trust` fails closed with the exact reason and no lane; deleted / committed-away / start-scan-only `.trust.toml` still counts; no-Trust repo unchanged; ways and verifying lines |
| REQ-plugins-525 | `tests/agent.trust-verify.test.ts` (".trust.toml is SAFE-2 protected like fledge.toml"): `isProtectedPath`, files-write / files-edit / files-delete refusals, reads and look-alike names open, git-commit deletion refused |
| AGENT-18 (Trust clause) | both of the above |
