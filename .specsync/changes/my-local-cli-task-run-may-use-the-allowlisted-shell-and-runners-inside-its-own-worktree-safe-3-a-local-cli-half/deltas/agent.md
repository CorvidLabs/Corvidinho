---
module: agent
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
---

# Delta: agent (the SAFE-3.a gate's local CLI half — REQ-cli-681)

## Modified

### REQUIREMENT REQ-agent-503

SAFE-3.a owner shell grant (#83, #124). The model SHALL be offered the
allowlisted `SAFE3A_TOOLS` (the shell, the language runners and the Fledge
core runs) only in the owner's own interactive runs (chat, `/session start`,
`/work`, the local CLI), only when the run's allowlist names them
(REQ-agent-501; the tier still filters, so code tier), and only inside that
talk's own worktree; non-owners, WATCH and schedules SHALL never get them.
`src/agent/shell-gate.ts` SHALL export `shellToolsGate({ env, cwd,
talkWorktree? })`, and `createTaskExecute` SHALL call it for every tool-loop
attempt whose effective allowlist names at least one `SAFE3A_TOOLS` name
(never with `includeDangerous`), passing its own optional `talkWorktree`
option, and pass its verdict to `buildOpenAiTools` as `safe3a`. The gate
SHALL grant only when all of these hold, each read again at that call:

- delegation depth 0 (`delegateDepthFromEnv`): a delegate or council worker
  never gets them;
- `CORVIDINHO_WATCH_SESSION_ID` empty and not a scheduled run
  (`isScheduleRunEnv`), whatever the stamp says (checked before the role
  session, so these reasons hold with or without one);
- with no role session (`CORVIDINHO_ACTING_IS_ADMIN` absent): the local CLI
  half (REQ-cli-681) — no `CORVIDINHO_DISCORD_SESSION_ID` and no
  `CORVIDINHO_ACTING_SURFACE` stamp (refused: `a run with no role session
  gets them only as a local CLI run, and this one carries a Discord session
  or surface stamp`), a `talkWorktree` (the worktree `task run` made for
  this run, REQ-cli-122, passed only by `taskRun`; refused without one: `a
  local CLI run gets them only in the new worktree it made for itself, not
  with --here or outside a git repo`), and a cwd that, resolved through
  symlinks, is exactly that worktree and a linked talk worktree whose admin
  dir points back at it (`isCliRunWorktree(cwd, worktree)`; refused: `the
  run is not at the top of the worktree this CLI run made for itself`).
  The remaining bullets apply to a role session only, which never uses
  `talkWorktree`;
- the surface stamp `CORVIDINHO_ACTING_SURFACE` (`ACTING_SURFACE_ENV`,
  `actingSurface(env)`) is `chat`, `ask`, `session` or `work`
  (`SAFE3A_SURFACES`); `watch`, `schedule`, an unknown value and no stamp are
  refused;
- `resolveActingRole(env)` is `owner` (owner match, the bridge's ADMIN bit,
  not muted, not deny-listed in the live file; IDENTITY-12);
- the cwd, resolved through symlinks, is the top of the linked talk worktree
  made for `CORVIDINHO_DISCORD_SESSION_ID` (`isOwnTalkWorktree`): its
  basename is `talkWorktreeId(sessionId)`, `talkWorktreeGitDir` finds its
  `worktrees/talk-*` admin dir, and that dir's `gitdir` file points back at
  it. The main checkout, another talk's worktree, a subdirectory, a non-git
  scoped dir or project folder, and a run with no session id SHALL be
  refused.

When the allowlist names one of them and the gate refuses, the attempt SHALL
leave them out of its catalog (a model call is refused as not offered, or
with the ROLES-CHAT-3 role refusal for a non-owner) and the run SHALL emit
one `Text` event per run, `[operator] SAFE-3.a: <names> allowlisted but not
offered: <reason>` (`shellToolsRefusedLine`), never part of the summary.
A granted call SHALL still go through `runPlugin` (role re-check, SAFE-1,
the must-ask gate: a prod or deploy command waits for the owner's Approve
card and a deny runs nothing, AUTONOMY-9; SAFE-5 audit) and the tool's own
SAFE-3 clamp, SAFE-21 refusals and credential-free env (SAFE-21 / SAFE-21.a,
unchanged). The stamp is internal: each spawning client always overwrites it
(REQ-discord-735, REQ-watch-735), and delegate workers and the verify lane
drop it with the `CORVIDINHO_ACTING_` prefix. No config key, flag, slash
command, table or schema change.

Acceptance Criteria
- `tests/agent.safe3a-gate.test.ts`: granted for the owner's `chat`, `session`, `work` and `ask` in the session's own talk worktree; refused for `watch`, `schedule`, unknown and missing stamps, a WATCH or `schedule_` marker, team, community, a forged owner id without the ADMIN bit, the ADMIN bit for a non-owner, a muted or deny-listed owner, no owner, delegation depth > 0, no role session outside its own CLI worktree, and every cwd but the own worktree top (main checkout, another talk's worktree, scoped dir, subdirectory, look-alike dirs, missing dir, no session id); `isWorkerEnvDropped` and `isVerifyEnvDropped` drop the stamp.
- `tests/agent.safe3a-owner-shell.test.ts`: the owner's chat in its own talk worktree is offered `shell-exec` at code tier and runs it there (so do `session`, `work` and `ask`); `kubectl get pods; touch ran.marker` raises exactly one `mustask` destructive card, a deny runs nothing and an approval runs it once; the main checkout, a team member, WATCH, a schedule, a delegate worker and a local CLI run with no worktree of its own are not offered it, the call is refused and nothing runs, with one `[operator] SAFE-3.a` line per run over two attempts and none in the summaries; muting the owner after attempt 1 removes it from attempt 2.
- The prod command in those tests runs a stand-in `kubectl` the test puts first on PATH, which records each call in the directory it ran in; it never runs the host's real `kubectl` (whose run time the test can't bound: ubuntu-latest CI runners ship one, and with an operator's KUBECONFIG it would contact a real cluster). An approval records exactly one call (`get pods`) in the talk worktree and none in the main checkout; a deny records none. A `kubectl` elsewhere on the host PATH, however slow, does not change the test's time.
- With the base's sources, the gate test cannot load and 8 of 9 end-to-end tests fail; they pass on the branch.
- A run with no role session carrying a Discord session id or surface stamp is refused with `a run with no role session gets them only as a local CLI run, and this one carries a Discord session or surface stamp`; a plain local CLI run with no worktree of its own with `a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo` (the local CLI half, REQ-cli-681, replaced `a local CLI run has no role session (the CLI half of SAFE-3.a is not built yet)`).
- The CLI rows (granted at the top of the run's own worktree; refused in place, in a subdirectory and elsewhere) are `tests/cli.safe3a-shell.test.ts` (REQ-cli-681).
