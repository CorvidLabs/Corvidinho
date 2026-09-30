---
module: agent
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
---

# Delta: agent (the owner's own talks get the allowlisted shell, runners and Fledge runs in their own worktree, SAFE-3.a)

## Modified

### REQUIREMENT REQ-agent-501

Allowlisted dangerous tools in the task-run catalog (CLI-3 / SAFE-1,
GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3). `buildOpenAiTools` SHALL take an optional
`allowlist` and SHALL offer a dangerous plugin only when that allowlist names
it (exact name) or `includeDangerous` is set (a test seam no product caller
sets). `createTaskExecute` SHALL pass the run's effective allowlist (its
`allowlist` option, else `CORVIDINHO_ALLOWLIST`, which `task run` passes), so
for every `task run` (local CLI, Discord, `/session start`, `/work`,
schedules, WATCH, delegate workers) a dangerous plugin enters the model's
catalog only when the operator allowlisted it; an unlisted dangerous plugin
stays out and a call to it is refused as not offered (REQ-agent-128).
`shell-exec`, `node-exec`, `python-exec`, `cargo-exec` and the Fledge core
runs `fledge-lanes-run` and `fledge-run` (PLUGIN-1, REQ-plugins-461)
(`SAFE3A_TOOLS`, formerly `SAFE3_PENDING_TOOLS`) SHALL be offered from the
allowlist only to an attempt the SAFE-3.a gate granted (REQ-agent-503): each
starts in the project dir, which is not a clamp, and a Fledge lane or task
runs whatever commands the project gives it. `allowlistOffers(allowlist,
name, safe3a = false)` and `BuildToolsOpts.safe3a` (default false) carry the
grant; without it they stay out even when named. They still run through
`corvidinho plugins run`. The tier filter (`minTier`), the
ROLES-CHAT-2 role filter (a community role session gets no dangerous or
mutating tool, whatever the allowlist; a team session only what
REQ-agent-065 allows), the SAFE-9 autonomous filter,
catalog-only dispatch and the SAFE-1 / SAFE-4 / SAFE-5 / GITHUB-6 runtime
gates in `runPlugin` and the handlers SHALL be unchanged. With an empty
allowlist the catalog SHALL be exactly as before. No config key, flag, slash
command or schema is added (the internal surface stamp is REQ-agent-503's).

Acceptance Criteria
- At tool tier, an allowlist naming `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review`, `memory-forget` and `memory-override` offers all six; `danger-ping`, `web-fetch` and `discord-post-message` (dangerous, not named) are not offered; with no allowlist no dangerous plugin is offered.
- Every dangerous tool offered at tool or code tier is one the allowlist names.
- `files-delete` allowlisted is offered at code tier and not at tool tier.
- An allowlist naming `shell-exec`, `node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run`, `fledge-run` and `files-delete` at code tier offers `files-delete` and none of the six without the SAFE-3.a grant; `fledge-lanes-run` and `fledge-run` are registered, dangerous, offered by `includeDangerous` at code tier, and `editsFilesUnreported` names them.
- A code-tier task run whose allowlist names the four Fledge core builtins offers only `fledge-lanes-list` and `fledge-lanes-validate` as `fledge-` tools; the model's call to `fledge-run` is refused as not offered, no fledge process starts and `unreportedEditTools` is absent.
- `actingIsAdmin: false` with every dangerous plugin allowlisted offers no dangerous or mutating tool.
- `task run` path (`createTaskExecute` without an `allowlist` option, non-interactive, GitHub dry run): with `CORVIDINHO_ALLOWLIST=github-pr-review` the model is offered `github-pr-review`, its call succeeds as a dry run, and its call to the unlisted `github-issue-create` is refused as not offered.
- An ADMIN role session (owner) with that allowlist is offered and runs `github-pr-review`; a community (non-ADMIN, not team) role session with the same allowlist is not offered it and no call succeeds.
- With `safe3a: true` and the owner role, the same allowlist at code tier offers every registered one of the six plus `files-delete`; at tool tier none of the six; an unlisted one of the six is never offered, and a team `/work` catalog gets none of them (`tests/agent.safe3a-gate.test.ts`).

### REQUIREMENT REQ-agent-502

Non-git verify gate after unreported edits (AGENT-4). A tool whose file edits
no tool result reports (`editsFilesUnreported`: a Fledge command, whose
`origin` starts with `fledge:`, and every `SAFE3A_TOOLS` name: the
shell, the runners and the Fledge core runs) that the tool loop dispatched
from the offered catalog SHALL be named in the attempt's
`ExecuteResult.unreportedEditTools` (absent when none ran).
A `delegate` call that started a worker (its result carries data) SHALL be
named too when the run has no role session and its allowlist names a Fledge
plugin command (a `fledge-*` name other than the four Fledge core builtins):
the worker gets that allowlist, so it may have run the Fledge command and its
edits reach the lead's result as no file (a role-session worker is non-ADMIN
and offered none).
A `delegate` call whose worker ran but left no result frame (its data has no
`verified`, which every result frame carries: the worker was stopped at its
timeout or by an abort, crashed, or could not start) SHALL be named whatever
the allowlist: whatever that worker edited reached the lead's result nowhere.
`runTask` SHALL union these names across attempts and, when no git snapshot
is available (the cwd is not in a git work tree, or the start snapshot could
not be read), no file was reported and a name was recorded, SHALL run the
verify lane anyway (fail closed) and emit one `Text` event per such attempt
starting `Verify gate: no git working tree to diff` that names the tools; the
run then ends `done` only when verify passes, and otherwise retries and fails
plainly. A run in a git work tree keeps the real diff (REQ-agent-085); a
non-git run that called only tools that report their files or change no
project files (GitHub, memory, Discord) still ends with nothing to verify
(REQ-agent-003). A project `fledge.toml` cannot turn this off (AGENT-14). No
env var, config key, flag, slash command or schema is added.

Acceptance Criteria
- Non-git project, allowlisted `fledge-hello` that writes `app.ts` and reports no files: verify runs once in the project dir, the run ends `failed` with `verified=false` and `filesChanged: []`, and the `Text` note names `fledge-hello`.
- The same with `includeDangerous` (every dangerous tool offered) also runs verify and fails.
- Non-git project whose only tool call was an allowlisted `github-pr-review` (dry run, success): verify is skipped and the run ends `done`.
- The same Fledge run in a project whose `fledge.toml` sets `verify_before_complete = false` still runs verify once and ends `failed` (AGENT-14).
- The execute result of an attempt that ran `fledge-hello` has `unreportedEditTools: ["fledge-hello"]`.
- Non-git project with autonomous mode on, allowlist `["fledge-hello"]`: a `delegate` call whose worker failed its own verify and reported no files makes the lead run verify, end `failed` (never `done`), and the note names `delegate`; with an allowlist naming no Fledge plugin command the same run skips verify and ends `done`.
- `editsFilesUnreported` names `fledge-lanes-run` and `fledge-run`.
- Non-git project with autonomous mode on and an empty allowlist: a `delegate` call whose worker writes `app.ts` and exits 137 before writing any result frame makes the lead run verify once in the project dir and end `failed` (`verified=false`, `verifySkipped=false`, never `done`), and the note names `delegate`.
- The owner's chat that ran the granted `shell-exec` in its own talk worktree has `unreportedEditTools: ["shell-exec"]` (`tests/agent.safe3a-owner-shell.test.ts`).

## Added

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
  no per-run talk worktree yet and is refused (the CLI half of SAFE-3.a is
  later work);
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
- With the base's sources, the gate test cannot load and 8 of 9 end-to-end tests fail; they pass on the branch.
