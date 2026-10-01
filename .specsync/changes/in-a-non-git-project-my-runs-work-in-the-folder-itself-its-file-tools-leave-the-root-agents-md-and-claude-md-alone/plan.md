---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: plan
---

# Plan

1. Capture AGENT-1.b and AGENT-1.c with `hi` (own commit); AGENT-1.a is on
   main.
2. `src/worktree/manager.ts`: `TalkWorkspaceKind` with `project_dir`,
   `EnsureTalkWorkspaceOptions.nonGit`, `guardsProjectDir` in park, remove
   and the scoped-dir setup; no base dir made up front.
3. `src/discord/session-store.ts`: `sessionWorkspaceKind`, bind in place,
   legacy / became-git re-bind, attachment clean-up in
   `parkSessionWorktree`; scheduler passes `nonGit: "scoped_dir"` and widens
   its kind type.
4. `src/plugins/roles.ts` `actingWorkTask(env, cwd)`; thread cwd through
   `refusedForRole`, the catalog and `runPlugin`.
5. `plugins/files/protectedPaths.ts` `isNonGitRootInstructionPath` +
   message; `refuseProtected` uses it.
6. `src/discord/image-attachments.ts` `sessionAttachmentDir` /
   `removeSessionAttachments`; bridge routes owner images there and keeps
   others URL-only in a `project_dir` talk.
7. Tests (three new files; `tests/roles.team.test.ts` fixture dir made a git
   repo); fail-on-base proof (swap the base's eleven modified sources in with
   shims for the three new exports the tests import, run, restore).
8. Docs, spec prose, module testing evidence, deltas; approve, check
   --commit, audit, coverage, hi check, tsc, bun test, fledge verify.
