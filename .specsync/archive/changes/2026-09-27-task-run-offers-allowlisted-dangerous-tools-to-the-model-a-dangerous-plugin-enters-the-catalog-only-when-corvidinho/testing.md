---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-501` | `tests/agent.allowlisted-dangerous.test.ts` | "GitHub writes and memory forget/override are offered at tool tier once allowlisted; unlisted dangerous tools stay out": all six offered; `danger-ping`, `web-fetch`, `discord-post-message` not; no allowlist ⇒ no dangerous tool. Fails on main (none offered). |
| `REQ-agent-501`, `REQ-agent-009` | `tests/agent.allowlisted-dangerous.test.ts` | "tier still filters: files-delete (minTier code) is offered at code tier, not at tool tier". Fails on main (never offered). |
| `REQ-agent-501` | `tests/agent.allowlisted-dangerous.test.ts` | "shell-exec and the node/python/cargo runners are never offered from the allowlist (SAFE-3 pending)": `SAFE3_PENDING_TOOLS` is exactly the four; with all four plus `files-delete` allowlisted at code tier only `files-delete` is offered. Fails on main (export missing, `files-delete` not offered). |
| `REQ-agent-501` | `tests/agent.allowlisted-dangerous.test.ts` | Guards (pass on main and branch): "every offered dangerous tool is one the allowlist names"; "a non-ADMIN role session gets no dangerous or mutating tool, whatever the allowlist (ROLES-CHAT-2)". |
| `REQ-agent-501` (CLI-3, GITHUB-3) | `tests/agent.allowlisted-dangerous.test.ts` | "CORVIDINHO_ALLOWLIST=github-pr-review: the review is offered and submitted (dry run); the unlisted issue create is refused, not run": `createTaskExecute` without an `allowlist` option (the `task run` path), non-interactive, GitHub dry run with the GITHUB-6 repo allowlist. Fails on main (not offered, refused). |
| `REQ-agent-501` (ROLES-CHAT-4) | `tests/agent.allowlisted-dangerous.test.ts` | "ADMIN role session (the owner) gets the allowlisted review; a non-ADMIN session with the same allowlist does not". Fails on main (ADMIN not offered). |
| `REQ-agent-112` (PLUGIN-3) | `tests/agent.allowlisted-dangerous.test.ts` | "allowlisting fledge-hello (no includeDangerous) discovers, offers and runs it at code tier" (fake `fledge` on PATH); the result carries `unreportedEditTools: ["fledge-hello"]`. Fails on main (fledge never discovered). Guard: "an allowlist with no fledge-* entry never spawns fledge". |
| `REQ-agent-502`, `REQ-agent-085` | `tests/agent.allowlisted-dangerous.test.ts` | "allowlisted fledge-hello edits app.ts in a non-git project without reporting it: verify runs and the run fails, never done": one verify call in the project dir, `failed`, `verified=false`, `filesChanged: []`, Text note names `fledge-hello`. Fails on main. |
| `REQ-agent-502` | `tests/agent.allowlisted-dangerous.test.ts` | "the same holds when every dangerous tool is included (includeDangerous seam)": proves the gate change on its own; on main the Fledge edit ran and the run ended done with verify skipped. |
| `REQ-agent-502`, `REQ-agent-085` | `tests/agent.allowlisted-dangerous.test.ts` | "a non-git run whose only tool was an allowlisted GitHub write still skips verify" (review succeeds; no verify; done). Fails on main only because the review is not offered. Guard: "with the verify gate off, nothing changes: done, verify skipped". |
| `REQ-agent-112` (ROLES-CHAT-2) | `tests/agent.allowlisted-dangerous.test.ts` | "a non-ADMIN role session with fledge-hello allowlisted never spawns fledge (ROLES-CHAT-2)": the fake `fledge` logs no call at all (not even discovery) and no `fledge-*` tool is registered. Fails before the review fix (discovery ran before the ADMIN check). Counterpart: "the owner's ADMIN role session with fledge-hello allowlisted discovers and offers it". |
| `REQ-agent-502` | `tests/agent.allowlisted-dangerous.test.ts` | "allowlist names fledge-hello: the lead verifies anyway after its worker, and never ends done on the failed lane": non-git project, autonomous on, a fake worker (`CORVIDINHO_BIN`) that failed its own verify and reported no files; the lead runs verify once, ends `failed`, the note names `delegate`. Fails before the review fix (the lead ended done, verify skipped). Guard: "allowlist names no fledge-* command: the worker cannot run one, so a non-git lead still skips verify". |
| `REQ-agent-128` | `tests/agent.tool-loop.test.ts` | "a registered but not-offered dangerous tool is refused, not run" (unlisted `danger-ping`, interactive) and "an allowlisted SAFE-3-pending tool (shell-exec) is not offered: refused, not run, even interactive" (no `ran.txt`). |
| `REQ-agent-008`, `REQ-agent-117`, `REQ-agent-roles-001`, `REQ-agent-085` | `tests/agent.tool-loop.test.ts`, `tests/fledge.plugins.test.ts`, `tests/roles.chat.gates.test.ts`, `tests/runners.plugins.test.ts`, `tests/web.fetch.test.ts`, `tests/autonomous.*.test.ts`, `tests/agent.loop.test.ts` | Existing tests pass unchanged (the `includeDangerous` seam, the default catalog, non-ADMIN catalogs, runners, the real-diff gate). |

Fail-on-main proof: with origin/main's `src/agent/tools.ts`, `execute.ts`,
`types.ts` and `loop.ts` swapped in, tests/agent.allowlisted-dangerous.test.ts
runs 6 pass / 11 fail (the 9 listed above as failing on main, plus the
owner's ADMIN Fledge discovery and the delegate fail-closed case); restored,
17 pass / 0 fail. With only the pre-review `execute.ts` (21d3fbb) swapped
in, the two review-fix tests fail (15 pass / 2 fail).

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.
