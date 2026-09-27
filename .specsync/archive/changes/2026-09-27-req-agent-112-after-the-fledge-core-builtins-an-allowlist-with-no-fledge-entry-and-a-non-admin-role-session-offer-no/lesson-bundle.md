# Lesson bundle — req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: REQ-agent-112 after the Fledge core builtins: an allowlist with no fledge-* entry and a non-ADMIN role session offer no Fledge plugin command and never spawn fledge; the only fledge- tools they offer are the read-only core builtins fledge-lanes-list and fledge-lanes-validate (PLUGIN-1, PLUGIN-3, ROLES-CHAT-2)
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: tests/agent.allowlisted-dangerous.test.ts, specs/agent/requirements.md
- **Acceptance**: tests/agent.allowlisted-dangerous.test.ts: with the Fledge core builtins registered (PLUGIN-1), a code-tier run whose allowlist names only github-pr-review, and a non-ADMIN role session with fledge-hello allowlisted, offer exactly the read-only core builtins fledge-lanes-list and fledge-lanes-validate as fledge- tools, offer and register no Fledge plugin command (fledge-hello), and start no fledge process (the fake fledge records no call). The owner's ADMIN role session still discovers and offers fledge-hello. REQ-agent-112 reads as one requirement again (the merge of #261 and #262 left a duplicated sentence), and its acceptance criteria say the same. No source change.

## Evidence

- Verification commit: `105a7bdf4045974dacefabb95a45a9fc192c7c1b`
- Base commit: `80ed1996639f4947d4f709d4410cc49a1474a95f`
- Verified by: `specsync check --spec agent`

## From the change's context.md

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

## From the change's testing.md

# Testing

`tests/agent.allowlisted-dangerous.test.ts`, describe "Fledge commands
through the allowlist (PLUGIN-3 / FLEDGE-4, REQ-agent-112)":

- "an allowlist with no fledge-* entry never spawns fledge": the offered
  `fledge-` tools are exactly `fledge-lanes-list` and `fledge-lanes-validate`;
  `fledge-hello` is neither offered nor registered; the fake fledge writes no
  `calls.log`, `other.log` or `runs.log`.
- "a non-ADMIN role session with fledge-hello allowlisted never spawns fledge
  (ROLES-CHAT-2)": the same offered set, `fledge-hello` neither offered nor
  registered, no `calls.log`.
- The ADMIN role session and allowlisted `fledge-hello` tests are unchanged.

Before the fix, on the merge of main into this branch: 15 pass, 2 fail in the
file (both failures were the `fledge-` prefix assertion). After: the file
passes in full.

## Where these lessons go

- `specs/agent/context.md`
