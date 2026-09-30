---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: research
---

# Research

- Sources: issue #124 (M4 tracker, three comments) and #83 (SAFE-3 tracker:
  body, Leif's clamp decision, three progress comments with the residuals),
  Leif's interview record `/home/user/coord/interview-2026-09-28.md` (round
  2 SAFE-3 model access; round 13 shell login), the slice record
  `/home/user/coord/pr-safe3a-gate.json` and the safe3a-shell rows of
  `/home/user/coord/m34-defaults.md` (`task run --here` is not a talk
  worktree; non-git project folders get no shell; delegate workers never
  inherit it; an ask continuation keeps it when the owner and own-worktree
  checks pass again; the config dir stays a refused path; the runners cannot
  be checked lexically).
- The catalog is built per attempt in `createTaskExecute`, which already
  re-resolves the role (`resolveActingRole(env)`) there; `runToolLoop`
  dispatches only offered names and `runPlugin` re-checks the role, SAFE-1,
  the must-ask gate and SAFE-5 at every call.
- Every Discord run goes through one spawn client
  (`src/discord/agent-client.ts`): the bridge's chat path and ask
  continuation, `/session start`, `/work` and the scheduler's `runOne`;
  WATCH has its own client. The session store binds each talk to
  `ensureTalkWorkspace({ sessionId })`: a git project gets a linked worktree
  `<base>/talk-<prefix>-<sha256>` whose admin dir is
  `.git/worktrees/talk-*` (with git's `gitdir` back-pointer), a non-git one
  a `scoped-talk-*` dir; `cwdFor` falls back to the project dir when no
  worktree is bound. The ask continuation resumes the same session and cwd,
  with the presser checked to be the session's user.
- Workers (`buildDelegateSpawn`, council voices) drop every
  `CORVIDINHO_ACTING_*` key and run at depth > 0; the verify lane's env
  drops the same keys.
- `shell-exec`'s must-ask classifier (`shellProdWhy`) raises the
  `mustask` destructive card for `kubectl`, `systemctl` and the rest of
  the prod table; the card fixture `tests/fixtures/must-ask.ts` answers it.
