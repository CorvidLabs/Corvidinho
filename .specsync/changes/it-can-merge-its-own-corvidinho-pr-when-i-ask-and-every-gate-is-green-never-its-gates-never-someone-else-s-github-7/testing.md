---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: testing
---

# Testing

`tests/github.self-merge.test.ts` (91 tests): a fake GitHub client
(`SelfMergeOctokit`; no network, no token), a temp data dir and allowlist
file (with the owner's `github_id`), the real must-ask gate and card store
(the owner's answer from the test hook, or the bridge's real card engine with
the one-time code), the real SAFE-5 chain, `createTaskExecute` with an
injected provider for the catalog.

Fail-on-base proof (base 86d68cd0, main after #374 and #392):
- (a) with `src/` and `plugins/` exactly as on the base (so no
  `plugins/github/merge.ts`), the file does not load (`Cannot find module
  '../plugins/github/merge.ts'`): 0 pass, 1 fail.
- (b) with the new `merge.ts`, `must-ask.ts`, `types.ts` and
  `plugins/github/index.ts` kept (so the file loads) but the base
  `src/plugins/run.ts`, `src/agent/tools.ts`, `execute.ts`,
  `events-ndjson.ts`, `loop-guards.ts` and `ask.ts`, `bun test
  tests/github.self-merge.test.ts tests/must-ask.boundary.test.ts
  tests/agent.loop-guards.test.ts` gave 81 pass, 33 fail: all 25 refusal
  cases, the card-denied, re-check-after-approval and GitHub-refused rows and
  the owner's-WATCH-run row (no `github-pr-merge:<reason>` row), the
  wait-status test (the base regex only knows `AUTONOMY-<n>`), the catalog
  test and the end-to-end not-offered test (offered everywhere it is
  allowlisted, the owner's GitHub-triggered WATCH run included), and the
  loop-guards classification (`github-pr-merge` in neither set).
- Restored: 114 of 114 pass (91 + 5 + 18).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-099` | `tests/github.self-merge.test.ts` "a passing merge, only after the owner's Approve card" (9 tests) | green PR + Approve: one `pulls.merge` with the named sha, `squash`, `<title> (#12)`; reply and `data.sha` name the merge sha; card kind `mustask-merge`, destructive, target `CorvidLabs/Corvidinho#12 at <sha>`; `started` + `ok` rows; owner chat / session / work / ask pass; denied card → `card-denied`; draft while the card waits → refused after `started`; GitHub 405 → `github-refused`; a run stopped after the Approve → `started` then `aborted`, no `pulls.merge`; a person's ready after an app's merges; dry run merges and asks nothing. |
| `REQ-plugins-099` | `tests/github.self-merge.test.ts` "each refusal raises no card …" (31 tests) | draft, foreign author, non-talk branch, fork head, closed, head moved, self-marked ready, opened ready with no person marking it ready, marked ready only by an app, an app marked it ready last after a person's ready and a draft again, gate path, rename away from a gate, short file list, changes requested, smoke / spec-sync missing / failed / pending / at another commit / from another app, another check red, blocked, unknown and conflicting mergeability, unreadable token user: no card, no merge, one `github-pr-merge:<reason>` row; a later approval settles a change request; non-Corvidinho repo and bad usage refused before any GitHub call; the required check names match ci.yml / spec-sync.yml. |
| `REQ-plugins-099` | `tests/github.self-merge.test.ts` "its own gates" and "only the owner's own interactive runs" | every gate path (incl. nested CODEOWNERS / AGENTS.md / CLAUDE.md / tsconfig.json, any `.trust.toml`, `.specsync` config, the merge code with `repo-ways.ts`, `delegate.ts` and `api.ts`) refused and ordinary paths (`specs/`, `.specsync/changes/`, `trust.toml`, `package.json`, `src/agent/tools.ts`, tests, docs) allowed; talk branch names match `generateTalkBranchName`; WATCH (by session id, by `watch` stamp, and the owner's own GitHub-triggered run as #374 stamps it), owner schedule, worker, missing stamp, muted owner, team and spawned local runs refused before any GitHub call; the local CLI passes; the owner's WATCH run passes the role gate but `runPlugin` refuses it with one `github-pr-merge:watch` row and no card; a team call stops at the role gate. |
| `REQ-plugins-097` | `tests/github.self-merge.test.ts` card-engine block (2 tests); `tests/must-ask.boundary.test.ts` | `MUST_ASK_POLICY.merge` is GITHUB-7.a with `mustask-merge` / destructive; on the real card engine Approve alone merges nothing and Approve + code merges once; only the must-ask builtins (now with `github-pr-merge`) carry a class. |
| `REQ-plugins-095` | `tests/github.self-merge.test.ts` (refusal rows); `tests/audit.log.test.ts` | refusals with `auditDenied` are one `denied` row `github-pr-merge:<reason>` (after `started` for the handler); results without it keep `ok` / `error` under the command name. |
| `REQ-agent-099` | `tests/github.self-merge.test.ts` catalog + end-to-end (3 tests); `tests/agent.loop-guards.test.ts` | `buildOpenAiTools` offers it only with `selfMerge` to owner / no role session, never team (even `/work`), community, unallowlisted or read tier; through `createTaskExecute` the owner's chat is offered it, WATCH (the owner's own GitHub-triggered run included) / owner schedule / team are not, each with one `[operator] GITHUB-7.a:` line; every risky builtin is in exactly one state set. |
| `REQ-agent-097` | `tests/github.self-merge.test.ts` "while the card waits, the live status says so"; `tests/must-ask.boundary.test.ts`, `tests/agent.events-ndjson.test.ts` | the `[operator] GITHUB-7.a: waiting for the owner's OK on an Approve card with the one-time code …` line maps to `MUST_ASK_WAIT_STATUS`; the AUTONOMY-11 sentence is still there. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push (results in the PR body). |
