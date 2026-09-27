# Lesson bundle — task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Task run offers allowlisted dangerous tools to the model: a dangerous plugin enters the catalog only when CORVIDINHO_ALLOWLIST names it (tier, role and SAFE-9 filters unchanged); shell-exec and the node/python/cargo runners stay out pending the SAFE-3 decision; a non-git run whose Fledge command may have changed files verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4)
- **Kind**: Feature
- **Specs**: agent
- **Paths**: src/agent/tools.ts, src/agent/execute.ts, src/agent/types.ts, src/agent/loop.ts, tests/agent.allowlisted-dangerous.test.ts, tests/agent.tool-loop.test.ts, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, docs/discord.md, .env.example, STATUS.md
- **Acceptance**: A task run (tool/code tier) offers a dangerous plugin to the model only when CORVIDINHO_ALLOWLIST (the run's allowlist) names it and its minTier fits the tier; unlisted dangerous plugins stay out of the catalog and a model call to one is refused as not offered; shell-exec, node-exec, python-exec and cargo-exec are never offered from the allowlist (SAFE-3 decision pending); a non-ADMIN role session (Discord non-owner, WATCH, schedules, council voices) still gets no dangerous or mutating tool; Fledge commands are discovered only when the allowlist names a fledge-* command and an allowlisted one is offered and runs; with no git work tree, an attempt that ran a Fledge command (or shell / runner) that reports no filesChanged still runs the verify lane and never ends done on a failed lane; tests fail on main and pass on the branch.

## Evidence

- Verification commit: `6438e6fa85a070d699903f5d58cf08bbac3b3a26`
- Base commit: `0940db343de30fdb4d79d83cfa44b95c5a247681`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

Captured HI (hi/*.md, not retired):

- CLI-3: "`--non-interactive` runs without asking, and dangerous tools are denied unless I allowlisted them."
- GITHUB-1: "I can ask it to list or open issues and pull requests on a repo I care about, and it does that through reviewed tools rather than improvised shell."
- GITHUB-3: "It can read a PR diff, comment, and submit a review without me pasting the patch into chat."
- ROLES-CHAT-4: "ADMIN (configured owner per IDENTITY-2) may use mutating tools subject to SAFE-1..9, ALLOW, ADMIN-4, MEMORY-ACL, and two-phase confirms."
- PLUGIN-3: "I can add a project or third-party Fledge plugin and have Corvidinho call it without a Corvidinho release."
- SAFE-1 (the consent rule the allowlist implements) and AGENT-4 (verify before done).

Gap on main (0940db3): `buildOpenAiTools` (src/agent/tools.ts:55) skipped every
dangerous entry unless `includeDangerous`, and no product caller set it
(`src/cli.ts` `createTaskExecute` passes only `allowlist`). So the GitHub
writes, `memory-forget` / `memory-override`, `files-delete`, the git writes and
every `fledge-*` command (Fledge discovery ran only with `includeDangerous`)
were never offered to the model, even when allowlisted: an allowlist entry
unlocked only `corvidinho plugins run` and the `/work` PR step
(docs/DISCORD-GO-LIVE.md said "`task run` does not offer dangerous plugins to
the model yet"). With the human CLI retired (CLI-1/2, #129) the agent path is
the one that counts for PLUGIN-3 and GITHUB-1/3.

Constraints: shell-exec and the node/python/cargo runners stay out until Leif
answers the SAFE-3 chdir question; Discord/WATCH role gates (ROLES-CHAT-*)
unchanged; no new env var, config key, flag, slash command, SQLite schema or
package version. AGENT-4 was refuted as a live gap only because no reachable
tool edits files without reporting them in a non-git project; offering Fledge
commands makes it reachable, so the non-git gate must fail closed in the same
change. Open PRs #232 / #233 (ask-button gate, SAFE-3 clamp) are not touched.

## From the change's design.md

# Design

- **Catalog filter (`src/agent/tools.ts`).** `buildOpenAiTools` keeps its
  order of filters and changes only the danger check: a dangerous entry is
  kept when `includeDangerous` (test seam) or `allowlistOffers(allowlist,
  name)` — the exact name is in the allowlist and not in
  `SAFE3_PENDING_TOOLS` (`shell-exec`, `node-exec`, `python-exec`,
  `cargo-exec`). The role filter (non-ADMIN drops every mutating tool, and
  every dangerous tool is mutating), the SAFE-9 autonomous filter and the
  tier filter still run, so the allowlist can only add tools an ADMIN / local
  run at that tier may see.
- **Execute (`src/agent/execute.ts`).** `createTaskExecute` already resolved
  the run's allowlist (`opts.allowlist ?? allowlistFromEnv()`) for
  `runPlugin`; it now passes the same set to `buildOpenAiTools`. Fledge
  discovery (a `fledge` subprocess) runs when `includeDangerous` or the
  allowlist offers a `fledge-*` name; otherwise no spawn, as before. The tool
  loop records every offered tool it dispatched for which
  `editsFilesUnreported(name)` holds (origin `fledge:` or SAFE-3 pending) and
  returns the names as `unreportedEditTools` on the completion and soft-land
  results (abort, error and ask results never reach the gate).
- **Gate (`src/agent/loop.ts`).** `runTask` unions `unreportedEditTools`
  across attempts. With the gate on, no workspace tracker (non-git cwd or
  unreadable start snapshot), no file in `filesChanged` and a recorded name,
  it emits `Verify gate: no git working tree to diff, and <names> may have
  changed files no tool reported, so verifying anyway.` and verifies. In a
  git work tree the real diff already covers these tools (REQ-agent-085).
- **Callers.** No caller changes: `task run` (src/cli.ts) already passes
  `allowlistFromEnv()`; Discord / `/session start` / `/work` spawns inherit
  the bridge env; WATCH, schedules and council voices are non-ADMIN (no
  dangerous tool); a delegate worker gets the lead's effective allowlist and
  is non-ADMIN when the lead is in a role session.
- **Most conservative reading** (choices pending Leif): the allowlist is the
  only consent (no new key, interactive runs are not widened); the four
  SAFE-3-pending tools stay out even when listed; the non-git fail-closed
  is limited to tools that can edit files unreported, so GitHub / memory /
  Discord runs in a non-git session do not start a verify lane.

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
