---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: design
---

# Design

- **Gate** (`src/agent/shell-gate.ts`): `shellToolsGate` takes an optional
  `talkWorktree`. Order: depth > 0 → WATCH marker → schedule marker (both now
  before the role-session check, same reasons) → no role session ⇒
  `localCliVerdict` → the unchanged role-session rules (stamp, owner role,
  own talk worktree). `localCliVerdict` refuses a Discord session id or any
  stamp (every product spawn sets a role session, so either means a spawn
  without one), refuses a missing / blank `talkWorktree` (in place:
  `--here`, non-git), refuses unless `isCliRunWorktree(cwd, talkWorktree)`,
  else grants. `isCliRunWorktree` = realpath(cwd) equals realpath(worktree)
  and the shared `isLinkedTalkTop` check (a `worktrees/talk-*` admin dir via
  `talkWorktreeGitDir` whose `gitdir` file points back), the same evidence
  `isOwnTalkWorktree` uses (refactored onto the helper, behaviour unchanged).
- **Why in-process**: `talkWorktree` is an option, not an env key, so a
  spawned child (whose env the parent controls) can never claim one; only
  `taskRun` sets it, from the `CliTaskWorkspace` it just made.
- **Wiring**: `createTaskExecute` gains `talkWorktree?` and passes it to the
  gate on every attempt; `taskRun` passes `ws.dir` to `taskRunIn` only for
  `kind: "worktree"` and `!roleSessionActive(process.env)`; `taskRunIn`
  forwards it. The run's cwd is `ws.cwd` (the start subdirectory inside the
  worktree), so a start in a subdirectory is refused (exact top only, like
  the Discord half).
- **Must-ask**: unchanged. With no bridge, the card is recorded, nobody
  decides it, it lapses at its TTL and the existing refusal text and wait
  line (routed by `setMustAskNotifier` to stderr / Text frames) say why.
- **Role**: no role session ⇒ the local operator (the owner on the box). No
  new owner check: there is no acting identity to check.
- **Docs**: CLI help line, README section, DISCORD-GO-LIVE E.3 / E.6 and tool
  rows, discord.md roles bullet, STATUS remaining-gaps line, spec prose.
