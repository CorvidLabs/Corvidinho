---
module: agent
change: the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took
---

# Delta — agent (SAFE-3.a end-to-end tests run a stand-in kubectl)

The requirement text is unchanged; one acceptance criterion is added so the
approved and denied prod-command tests never run the host's real `kubectl`.
No product code, config key, flag, slash command, table or schema changes.

## Modified

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
- The prod command in those tests runs a stand-in `kubectl` the test puts first on PATH, which records each call in the directory it ran in; it never runs the host's real `kubectl` (whose run time the test can't bound: ubuntu-latest CI runners ship one, and with an operator's KUBECONFIG it would contact a real cluster). An approval records exactly one call (`get pods`) in the talk worktree and none in the main checkout; a deny records none. A `kubectl` elsewhere on the host PATH, however slow, does not change the test's time.
- With the base's sources, the gate test cannot load and 8 of 9 end-to-end tests fail; they pass on the branch.
