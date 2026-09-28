---
change: req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no
artifact: context
---

# Context

Two PRs changed REQ-agent-112 on separate branches:

- #261 (merged, `f98e5d8`) lets an allowlisted `fledge-<command>` into the
  catalog without `includeDangerous`, gated by `allowsFledge(allowlist)` and
  an ADMIN check before discovery. Its two new tests assert that a run whose
  allowlist names only `github-pr-review`, and a non-ADMIN role session with
  `fledge-hello` allowlisted, offer no tool whose name starts with `fledge-`.
- #262 (this branch) registers Fledge itself as typed builtins (PLUGIN-1):
  `fledge-lanes-list` and `fledge-lanes-validate` are read-only (`dangerous:
  false`, minTier 0), so every catalog offers them; they spawn fledge only
  when called. It had already changed the default-catalog test the same way.

After merging main, `bun test` failed those two #261 tests: the read-only
core builtins are offered, as #262 intends. Both tests' real invariant still
holds — no fledge process starts (the fake fledge logs nothing) and
`fledge-hello` is neither offered nor registered. The automatic spec merge
also left a duplicated sentence in REQ-agent-112.

Scope: `tests/agent.allowlisted-dangerous.test.ts` and REQ-agent-112 only.
No source change. `src/agent/execute.ts` gating is unchanged. #232 and #233
are not touched.
