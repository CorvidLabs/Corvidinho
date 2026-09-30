---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: design
---

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
