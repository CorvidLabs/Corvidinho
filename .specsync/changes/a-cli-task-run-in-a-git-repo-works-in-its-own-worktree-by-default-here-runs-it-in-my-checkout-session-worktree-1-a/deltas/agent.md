---
module: agent
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
---

# Delta: agent (delegate / council workers pass --here; the SAFE-3.a gate names a local CLI run by its missing role session — SESSION-WORKTREE-1.a)

## Modified

### REQUIREMENT REQ-agent-117

Autonomous mode SHALL be off until the project enables it in project config
(AUTONOMOUS-1). `src/autonomous/enabled.ts` SHALL read `<cwd>/fledge.toml` and
treat autonomous mode as enabled only when the key
`corvidinho.autonomous.enabled` (table `[corvidinho.autonomous]` or the dotted
key under `[corvidinho]`) is the literal `true`. A missing file, section or
key, any other value, an inline table, or a key under a later `[table]` /
`[[array]]` header SHALL be off.

The task-run tool loop SHALL offer autonomous extras (plugins declaring
`autonomous: true`, such as `delegate`) only when the session is allowed:
autonomous mode is enabled for the run's cwd and the delegation depth
(`CORVIDINHO_DELEGATE_DEPTH`; unset is 0, a malformed value is treated as the
cap) is below 2. Otherwise they SHALL be absent from the catalog at every tier
(SAFE-9), and a model naming them SHALL get the REQ-agent-128 refusal. The
loop SHALL pass its capability tier and abort signal to `runPlugin`.

The delegation core (`src/autonomous/delegate.ts`) SHALL run a worker as
`task run --here --non-interactive --tier <t> --output ndjson --task <text>`
through `buildCorvidinhoArgv` (`--here`: the worker works in its lead's cwd
and never makes a worktree of its own, REQ-cli-122) (so a `.ts` bin runs as `bun --no-env-file`), with
the `--task` value last and never `--no-verify` (REQ-cli-085): a worker keeps
the project's prove-before-done gate (AGENT-4) and reports its `verified` /
`verifySkipped` outcome. The worker bin SHALL be `CORVIDINHO_BIN` when set,
else this checkout's `src/cli.ts`, never the cwd's. The worker tier SHALL be
the requested tier clamped to the lead's; an omitted tier SHALL mean the
lead's tier and an unknown tier SHALL be refused. The worker env SHALL be
the lead's env without `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`,
`CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key (SAFE-6; LLM
provider keys stay), and SHALL force the depth to the lead's depth + 1,
`CORVIDINHO_LLM_TIER` to the worker tier, `CORVIDINHO_NON_INTERACTIVE=1` and
`CORVIDINHO_ALLOWLIST` to the lead's effective allowlist, overriding inherited
values, so a worker never inherits ADMIN or human SAFE-4 confirm tokens. When
the lead runs in a ROLES-CHAT role session (`CORVIDINHO_ACTING_IS_ADMIN` set)
the worker env SHALL set `CORVIDINHO_ACTING_IS_ADMIN=0`, making the worker a
non-ADMIN session with read/chat tools only (ROLES-CHAT-2/3); a lead outside a
role session (local CLI) SHALL get a worker outside one. At most 2
workers SHALL run at once and at most 4 SHALL start per lead process; beyond
that the call is refused, not queued. A worker SHALL be stopped on lead abort
(AGENT-3), after a 10 minute timeout, or when the lead process exits or dies
of a SIGINT / SIGTERM / SIGHUP it did not start with ignored
(REQ-plugins-154); it SHALL run in its own process group and
stopping it SHALL stop its whole process tree (SIGTERM, then SIGKILL after a
2 s grace or as soon as the worker exits, REQ-plugins-154), so its plugins
and depth-2 workers never outlive the limit. What the worker left in its
group as it exited SHALL still be stopped by an abort or timeout during the
pipe drain, or by the lead exiting. The
lead SHALL NOT wait on a worker pipe held open by a grandchild beyond a short
drain after the worker exits. The worker summary returned to the lead SHALL be
SAFE-6 scrubbed and capped. The depth, tier and fan-out limits are safety
defaults; draft AUTONOMOUS-10 is not an acceptance criterion and stays left
for HI capture.

Acceptance Criteria
- Only `[corvidinho.autonomous] enabled = true` (or the dotted key) turns autonomous mode on; string / number / inline-table / later-table values and a missing file are off; this repo's `fledge.toml` ships off.
- `buildOpenAiTools` omits `delegate` unless `autonomous: true`, and offers it at code tier only.
- `createTaskExecute` in a temp project with autonomous enabled at code tier offers `delegate`; a disabled project, tool tier, or depth 2 does not; a model call to a hidden `delegate` is refused, not run.
- A lead tool loop that calls `delegate` against a fake bin receives the worker summary in the tool message, and the worker's filesChanged join the lead's result.
- Depth parse fails closed; tier clamp never exceeds the lead; spawn argv uses `bun --no-env-file` with `--task` last and no `--no-verify` flag; forced worker env overrides inherited env; the limiter refuses past 2 concurrent / 4 per run.
- The worker env (and the spawned worker process) has no `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` or inherited `CORVIDINHO_ACTING_*` key and keeps LLM provider keys; a role-session lead gets `CORVIDINHO_ACTING_IS_ADMIN=0`, a CLI lead none.
- A non-ADMIN role session's catalog leaves out `delegate` even when autonomous mode is allowed; the ADMIN owner's catalog offers it (ROLES-CHAT-2/4).
- Worker timeout, lead abort, and a grandchild holding the pipe do not hang the lead; a `.env` in the cwd is not loaded by a `.ts` worker.
- Worker timeout and lead abort kill the worker's same-group and `setsid` grandchildren, not just the worker.
- A lead abort after the worker exited, while its background grandchild still holds the pipe, kills that grandchild.
- Spawn argv has `--here` right after `task run` (REQ-cli-122): a worker never makes a worktree of its own.

### REQUIREMENT REQ-agent-503

SAFE-3.a owner shell grant (#83, #124). The model SHALL be offered the
allowlisted `SAFE3A_TOOLS` (the shell, the language runners and the Fledge
core runs) only in the owner's own interactive runs, only when the run's
allowlist names them (REQ-agent-501; the tier still filters, so code tier),
and only inside that talk's own worktree; non-owners, WATCH and schedules
SHALL never get them. `src/agent/shell-gate.ts` SHALL export
`shellToolsGate({ env, cwd })`, and `createTaskExecute` SHALL call it for
every tool-loop attempt whose effective allowlist names at least one
`SAFE3A_TOOLS` name (never with `includeDangerous`) and pass its verdict to
`buildOpenAiTools` as `safe3a`. The gate SHALL grant only when all of these
hold, each read again at that call:

- delegation depth 0 (`delegateDepthFromEnv`): a delegate or council worker
  never gets them;
- a role session (`CORVIDINHO_ACTING_IS_ADMIN` present): a local CLI run has
  no role session and is refused, whether it works in its own worktree
  (REQ-cli-122) or, with `--here`, in the checkout (the CLI half of SAFE-3.a
  is later work);
- `CORVIDINHO_WATCH_SESSION_ID` empty and not a scheduled run
  (`isScheduleRunEnv`), whatever the stamp says;
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
- `tests/agent.safe3a-gate.test.ts`: granted for the owner's `chat`, `session`, `work` and `ask` in the session's own talk worktree; refused for `watch`, `schedule`, unknown and missing stamps, a WATCH or `schedule_` marker, team, community, a forged owner id without the ADMIN bit, the ADMIN bit for a non-owner, a muted or deny-listed owner, no owner, delegation depth > 0, no role session, and every cwd but the own worktree top (main checkout, another talk's worktree, scoped dir, subdirectory, look-alike dirs, missing dir, no session id); `isWorkerEnvDropped` and `isVerifyEnvDropped` drop the stamp.
- `tests/agent.safe3a-owner-shell.test.ts`: the owner's chat in its own talk worktree is offered `shell-exec` at code tier and runs it there (so do `session`, `work` and `ask`); `kubectl get pods; touch ran.marker` raises exactly one `mustask` destructive card, a deny runs nothing and an approval runs it once; the main checkout, a team member, WATCH, a schedule, a delegate worker and a local CLI run are not offered it, the call is refused and nothing runs, with one `[operator] SAFE-3.a` line per run over two attempts and none in the summaries; muting the owner after attempt 1 removes it from attempt 2.
- The prod command in those tests runs a stand-in `kubectl` the test puts first on PATH, which records each call in the directory it ran in; it never runs the host's real `kubectl` (whose run time the test can't bound: ubuntu-latest CI runners ship one, and with an operator's KUBECONFIG it would contact a real cluster). An approval records exactly one call (`get pods`) in the talk worktree and none in the main checkout; a deny records none. A `kubectl` elsewhere on the host PATH, however slow, does not change the test's time.
- With the base's sources, the gate test cannot load and 8 of 9 end-to-end tests fail; they pass on the branch.
- A local CLI run's refusal reason is `a local CLI run has no role session (the CLI half of SAFE-3.a is not built yet)` (REQ-cli-122 gives it a worktree of its own, so it no longer says it has none).
