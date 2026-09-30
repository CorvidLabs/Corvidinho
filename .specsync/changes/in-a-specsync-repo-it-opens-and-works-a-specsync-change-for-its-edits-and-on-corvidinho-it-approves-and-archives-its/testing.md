---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: testing
---

# Testing

Temp git repos, a talk-style linked worktree, a bare `origin` for /work, a
fake `specsync` (records argv; `change new` writes the change folder,
`finalize` archives it, ids starting `fail-<step>` fail) and a fake `hi`
(`hi export` JSON) on PATH, stub verify runners printing a `bun test`
summary. No network, no key, no real `specsync` or `hi`. "Corvidinho itself"
is a temp repo with origin github.com/CorvidLabs/Corvidinho that the code-only
seam `setCorvidinhoCheckoutForTests` names as this checkout.

Fail-on-base proof: with the base's (7090656)
`src/agent/{loop,execute,types,tools,loop-guards}.ts`,
`src/plugins/{roles,types}.ts`, `src/work/pr.ts` and
`plugins/specsync/{commands,api}.ts` swapped in (the new
`src/agent/repo-ways.ts` kept so the test file loads),
`bun test tests/agent.repo-ways.test.ts tests/roles.team.test.ts` gave
35 pass, 17 fail: 15 of the new file's 26 tests (every gate, prompt, tool,
approve / finalize, lifecycle and /work case; the base verifies uncovered
edits, has no change tools and opens the /work PR) and the two catalog tests
of `tests/roles.team.test.ts`. The 11 that pass are pure `repo-ways.ts`
units. Restored: all pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("detectRepoWays") | all three ways found, none in a plain repo (no front matter, disabled `sdd.json`); removed from the working tree → HEAD keeps them; committed away → only the base keeps them; a disabled `sdd.json` in the tree still leaves the merged policy enabled and required; non-git reads the tree; ways line text and null. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("SpecSync coverage") | meaningful vs ignored (specific wins, defaults), unparseable fails closed, merged policies strict, file / dir coverage, archived-in-diff covers, archived-before does not, not required covers all. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("the verify gate …") | uncovered edit → `SpecSync gate:` note naming `src/app.ts` and `specsync-change-new`, no lane, `VerifyResult` false, retry feedback starts with the note; covered retry → lane once, verified; `ctx.repoWays` `{ sdd: true, hi: true, trust: false }`; deleting `sdd.json` and committing mid-run → failed, no lane; a plain repo unchanged (no ways line, no `repoWays`). Fail on the base. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("the tool loop gets one fixed prompt block") | the system prompt carries the SpecSync and hi block with `repoWays` and not without; Trust alone adds none. Fails on the base. |
| `REQ-agent-519` | `tests/agent.repo-ways.test.ts` ("runTask approves and archives …") | Corvidinho + allowlist: `change new`, `approve --actor corvid-agent`, `check`, `review --reviewer corvid-agent`, `finalize`, lane twice, archived, verified; another origin: only `new`, lane once, "stays open for a human"; no allowlist: SAFE-1 line, verified, another open change untouched; second lane fails → failed; failing approve → line with the reason, no finalize, verified. Fail on the base. |
| `REQ-agent-002` | `tests/agent.repo-ways.test.ts` (gate and lifecycle cases) | no lane call while a path is uncovered; lane once when covered; a second lane after the own-change steps. |
| `REQ-agent-065` | `tests/agent.repo-ways.test.ts` ("shape"), `tests/roles.team.test.ts` | approve / finalize never offered even allowlisted for the owner; team `/work` adds exactly files-write / files-edit / specsync-change-new / specsync-change-answer. The catalog test fails on the base. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` | every dangerous or mutating builtin, the four new tools included, is in exactly one set. |
| `REQ-plugins-518` | `tests/agent.repo-ways.test.ts` ("SpecSync change tools") | shapes; `SDD_OFF_REFUSAL`; `--root` refused, nothing spawned; `opened: ["fix-the-app"]` recorded in the ledger; `change status` argv; hi answers citing none / AGENT-99 / retired AGENT-2 refused with nothing spawned, AGENT-18.a spawns the joined answer, other questions and non-hi repos unchecked; `citedHiIds` families. Fail on the base. |
| `REQ-plugins-519` | `tests/agent.repo-ways.test.ts` ("Corvidinho is a fixed fact", "approve and finalize") | origin URL forms; look-alike repo not Corvidinho, the checkout and its worktree are, a changed origin is not; outside Corvidinho `HUMAN_LIFECYCLE_LINE` with nothing spawned; not this run's change, no verified mark, WATCH, schedule session, schedule stamp, worker, community refused; allowlisted approve spawns `change approve c1 --actor corvid-agent`; not allowlisted is a SAFE-1 denial. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/agent.repo-ways.test.ts` | `TEAM_WORK_TOOLS` exactly the six; new / answer allowed for team only with the work flag, never for community. Fails on the base. |
| `REQ-plugins-114` | `tests/fledge.plugins.test.ts` | the builtins plus a discovered Fledge plugin stay under the default budget with the new tools loaded. |
| `REQ-discord-518` | `tests/agent.repo-ways.test.ts` ("/work checks SpecSync coverage …") | uncovered → `sdd-uncovered` naming `src/app.ts`, no plugin call; archived on the branch → `git-commit` → `git-push` → `github-pr-create`; `sdd.json` deleted and committed on the branch → still `sdd-uncovered`. Fail on the base. |
