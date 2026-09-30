# Lesson bundle — owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a)
- **Kind**: Feature
- **Specs**: agent, discord, watch
- **Paths**: src/agent/shell-gate.ts, src/agent/tools.ts, src/agent/execute.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/scheduler/service.ts, src/watch/agent-client.ts, tests/agent.safe3a-gate.test.ts, tests/agent.safe3a-owner-shell.test.ts, tests/discord.safe3a-surface.test.ts, tests/agent.allowlisted-dangerous.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, STATUS.md
- **Acceptance**: createTaskExecute offers the allowlisted shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run (SAFE3A_TOOLS, renamed from SAFE3_PENDING_TOOLS) at code tier only when shellToolsGate grants the attempt: delegate depth 0, a role session, no WATCH or schedule marker, a surface stamp (CORVIDINHO_ACTING_SURFACE) of chat, ask, session or work, the acting role re-resolved now as owner (not muted or deny-listed), and a cwd that is the top of the linked talk worktree made for this session (talk-<id>, git admin dir pointing back at it); the owner's chat in its own worktree runs shell-exec there, and a prod command still raises the must-ask Approve card and a deny runs nothing; anywhere else (main checkout, another talk's worktree, a non-git scoped dir, team or community, WATCH, schedules, delegate workers, the local CLI) the tools stay out, the model's call is refused, and one [operator] SAFE-3.a Text line per run says why (never reply text); the gate is re-read every attempt; the Discord spawn client always overwrites CORVIDINHO_ACTING_SURFACE with the caller's surface (chat message chat, ask pick or Answer form ask, /session start session, /work work, schedule tick schedule, none empty) and the WATCH client with watch; workers and the verify lane drop it

## Evidence

- Verification commit: `6433d7781d811ce730df524db5d7ae221c3e2dd2`
- Base commit: `507d97b75b08ebe86c5e0c5ab19322ea82d683cb`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec watch`

## From the change's context.md

# Context

Issue #83 (M3, shell with the cwd clamped; tracker for SAFE-3) and milestone
#124 (M4 safe autonomy), slice safe3a-gate of the M3/M4 plan
(`/home/user/coord/pr-safe3a-gate.json`). SAFE-3.a is captured on main from
Leif's 2026-09-28 interview (round 2): "The model may use the shell, the
language runners and Fledge lane/task runs only in my own interactive runs
(chat, /session start, /work, local CLI), only when I allowlist them, and
only inside that talk's own worktree; non-owners, WATCH and schedules never
get them." Nothing new is captured in `hi/`.

What was true on main (507d97b): `SAFE3_PENDING_TOOLS` kept `shell-exec`,
`node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run` and
`fledge-run` out of every model catalog, whoever ran and wherever, so the
owner could not let the agent build or test in its own talk; only operator
`corvidinho plugins run` reached them. SAFE-3 (the clamp), SAFE-21 (the
foot-gun refusals) and SAFE-21.a (credential-free child env) shipped in
#309, and the must-ask gate (#319) classifies shell / runner / Fledge prod
and deploy commands.

This change is the Discord half of SAFE-3.a: the owner's chat,
`/session start`, `/work` and the ask answers that continue them. The
local CLI half (safe3a-cli) needs `task run` to have a per-run worktree
first, so a local run stays refused here; SAFE-3.a is therefore partly met.

Constraints: specs only through SpecSync; no new config key, flag, table or
schema bump; `runToolLoop`'s model-call code and `src/agent/providers.ts`
untouched (providers-3 in flight); #232 / #233 scope untouched; the shell
grant goes through `runPlugin`'s must-ask gate, never around it. Conservative
defaults come from the safe3a-shell rows of
`/home/user/coord/m34-defaults.md` and are listed in the PR under "Design
choices pending Leif".

## From the change's design.md

# Design

- **Gate** (`src/agent/shell-gate.ts`, new): `shellToolsGate({ env, cwd })`
  checks, cheapest first: delegation depth, role session, WATCH / schedule
  markers, the surface stamp, the role (`resolveActingRole`, the same
  resolver `runPlugin` uses) and the own-worktree test
  (`isOwnTalkWorktree`: realpath, basename = `talkWorktreeId(sessionId)`,
  `talkWorktreeGitDir` finds a `worktrees/talk-*` admin dir, and its
  `gitdir` file points back at this dir). Any doubt refuses; never throws.
- **Catalog** (`src/agent/tools.ts`): `SAFE3_PENDING_TOOLS` becomes
  `SAFE3A_TOOLS` (same six); `allowlistOffers(allowlist, name, safe3a)` and
  `BuildToolsOpts.safe3a` let a granted attempt offer them.
  `editsFilesUnreported` keeps naming them.
- **Per attempt** (`createTaskExecute` in `src/agent/execute.ts`): when the
  allowlist names any of the six (and not `includeDangerous`), the gate runs
  for that attempt after the role resolution and before the catalog is
  built; a refusal emits one operator `Text` line per run. `runToolLoop` is
  not touched: dispatch stays catalog-only, and `runPlugin` keeps the role
  re-check, SAFE-1, the must-ask card and SAFE-5 for each call.
- **Surface stamp**: `AgentRunChatOpts.surface`; the Discord spawn client
  always writes `CORVIDINHO_ACTING_SURFACE` (empty when none), the WATCH
  client `watch`. Call sites: bridge chat `chat`, bridge ask continuation
  `ask`, `/session start` `session`, `/work` `work`, scheduler
  `schedule`. Workers and the verify lane drop it by prefix.
- **Not changed**: the tools themselves (clamp, SAFE-21, credential-free env,
  must-ask classifiers), roles, the worktree manager, the CLI `task run`
  path (no role session ⇒ refused), `runToolLoop` and the providers.

## From the change's testing.md

# Testing

Regression tests (fixtures only: temp git projects and talk worktrees made
by `ensureTalkWorkspace`, a temp allowlist file, an injected fake provider,
the real approvals store answered by `tests/fixtures/must-ask.ts`, fake spawn
bins, the bridge with a null gateway, the scheduler in manual mode; no
network, no tokens).

- `tests/agent.safe3a-gate.test.ts` (8 tests, new).
- `tests/agent.safe3a-owner-shell.test.ts` (9 tests, new).
- `tests/discord.safe3a-surface.test.ts` (3 tests, new).
- Adjusted: `tests/agent.allowlisted-dangerous.test.ts` (`SAFE3A_TOOLS`).

Fail-on-base proof: in this branch's worktree, the base's (507d97b)
`src/agent/tools.ts`, `src/agent/execute.ts`, `src/discord/agent-client.ts`,
`src/discord/bridge.ts`, `src/discord/command-handlers/session.ts`,
`src/discord/command-handlers/work.ts`, `src/scheduler/service.ts` and
`src/watch/agent-client.ts` swapped in and `src/agent/shell-gate.ts`
removed: the four files give 13 failures (`agent.safe3a-gate` cannot load
its module; 8 of 9 `agent.safe3a-owner-shell` tests, all but the no-gate
guard; all 3 `discord.safe3a-surface` tests; the renamed-set test in
`agent.allowlisted-dangerous`). With the branch's sources restored all 39
tests in the four files pass. On the branch: `bunx tsc --noEmit` clean, full
`bun test` green, `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "granted: the owner's chat, /session start, /work and ask answer in the talk's own worktree" | `shellToolsGate` grants `chat`, `session`, `work` and `ask` for the owner in the session's own talk worktree. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: WATCH, schedules, an unknown surface and no stamp, even for the owner in the own worktree" | `watch`, `schedule`, empty, unset and `cli` stamps refuse naming the surface; a WATCH session marker and a `schedule_` session id refuse whatever the stamp. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: non-owners, and an owner who is muted or deny-listed (role re-resolved now)" | Team, community, the owner id without the ADMIN bit, the ADMIN bit for a non-owner, `DISCORD_MUTED_USER_IDS`, a live deny list and no configured owner all refuse ("only the owner's own runs get them"). |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: delegate and council workers (depth > 0) and the local CLI (no role session)" | Depth 1, 2 and junk refuse; no `CORVIDINHO_ACTING_IS_ADMIN` refuses as a local CLI run. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: any cwd but the top of this talk's own linked worktree" | Main checkout, another talk's worktree, scoped non-git dir, a subdirectory, a look-alike dir pointing at the main repo, one borrowing the talk's admin dir, a missing dir and no session id refuse; the other session is granted only in its own worktree; a symlink to the own worktree resolves to it. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "the stamp never reaches a worker or the verify lane; the refusal line names tools and reason" | `isWorkerEnvDropped` / `isVerifyEnvDropped` drop `CORVIDINHO_ACTING_SURFACE`; the operator line text. |
| `REQ-agent-501` | `tests/agent.safe3a-gate.test.ts` › "the catalog: with the grant the allowlisted six are offered at code tier (never at tool tier); without it none" | `safe3a: true` offers each registered one of the six plus `files-delete` at code tier; none at tool tier, none without the grant, never an unlisted one, none to team `/work`; `allowlistOffers` truth table. |
| `REQ-agent-501` | `tests/agent.allowlisted-dangerous.test.ts` › "shell-exec, the node/python/cargo runners and the Fledge core runs are not offered from the allowlist without the SAFE-3.a grant" | `SAFE3A_TOOLS` is exactly the six; a local catalog naming them offers only `files-delete`; the seam still offers the Fledge core runs. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "offered at code tier and it runs in the talk worktree; no SAFE-3.a line" | The owner's chat is offered `shell-exec`, the command runs in the talk worktree (marker there, not in the project), no operator line, summary `done`. |
| `REQ-agent-502` | same test | `unreportedEditTools` is `["shell-exec"]`. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "/session start, /work and an ask answer continuing the talk get it too" | `session`, `work` and `ask` stamps are offered `shell-exec`. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "the owner's shell-exec of a prod command still raises the must-ask Approve card; a deny runs nothing" | One `mustask` destructive card carrying the exact command; the call fails, no marker, the AUTONOMY-9 wait line is emitted. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "approved on the card, the same prod command runs once in the talk worktree" | One card; after the approval the marker exists. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "the owner's run outside its own worktree (the main checkout): refused as not offered", "a team member's chat in its own worktree: refused", "WATCH, a schedule, a delegate worker and a local CLI run: refused" | Neither `shell-exec` nor `fledge-run` offered in either attempt, both calls refused (not offered / role refusal), no marker, exactly one `[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: <why>` line per run, none in the summaries; the owner's `files-delete` stays offered. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "the gate is re-read every attempt: muted after attempt 1, the owner's attempt 2 has no shell" | Attempt 1 offered, attempt 2 not, one line. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "an allowlist that names none of the six: no gate, no line" | No operator line on a `watch` run allowlisting only `files-delete`. |
| `REQ-discord-735` | `tests/discord.safe3a-surface.test.ts` › "Discord: the caller's surface, else empty; WATCH: always watch" | The child sees each given surface, an empty one when none, never the parent's stale `chat`. |
| `REQ-watch-735` | same test | The WATCH child sees `watch` with `chat` in the watcher's env. |
| `REQ-discord-735` | `tests/discord.safe3a-surface.test.ts` › "chat message → chat, ask pick → ask, /session start → session, /work → work" | Recorded `surface` values in order; the ask answer keeps the chat's session id and cwd. |
| `REQ-discord-735` | `tests/discord.safe3a-surface.test.ts` › "a schedule tick → schedule" | The scheduler's run passes `schedule`. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
