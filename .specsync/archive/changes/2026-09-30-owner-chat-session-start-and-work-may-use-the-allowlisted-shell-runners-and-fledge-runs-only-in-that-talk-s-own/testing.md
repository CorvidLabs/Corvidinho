---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: testing
---

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
