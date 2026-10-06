---
module: discord
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
---

# Delta: discord (a non-git project's talks work in the folder itself, its schedules in their own folder, and park never deletes the project — AGENT-1.a, AGENT-1.c)

## Added

### REQUIREMENT REQ-discord-110

In a project that isn't a git repo, the owner's runs work in the project
folder itself (protected files and the verify gate still apply) and other
people's runs only read there (AGENT-1.a, captured in `hi/agent.md` from
Leif's 2026-09-28 interview); schedules for such a project work in their own
separate folder, never in the live project folder (AGENT-1.c, captured in this
change's PR from Leif's 2026-09-30 decision, round 13 of that record). A
project "isn't a git repo" when `isGitRepo` is false (a folder inside a git
work tree counts as git).

- `ensureTalkWorkspace` SHALL take `nonGit: "scoped_dir" | "project_dir"`
  (default `scoped_dir`). With `project_dir` and a non-git project it SHALL
  return `kind: "project_dir"` with `workDir` and `projectWorkingDir` the
  project folder, and SHALL create no worktree base, scoped dir or branch. A
  git project SHALL always get its linked worktree.
- `SessionStore.bindWorktree` SHALL ask for `project_dir`, so every Discord
  talk (chat, ask pick and Answer resumes, `/session start`, `/work`, the
  SESSION-3.a resume) in a non-git project runs with the project folder as its
  cwd, and a restart re-binds it there. The workspace kind of a row SHALL be
  derived without a new column (`sessionWorkspaceKind`: a branch ⇒
  `worktree`; a path that is the project folder by realpath ⇒
  `project_dir`; else `scoped_dir`). A mid-conversation project switch
  SHALL still be refused (SESSION-WORKTREE-4). An active row bound to a scoped
  dir of a project that is not a git repo (bound before this change), or bound
  in place to a project that has since become a git repo, SHALL be parked and
  then bound afresh (the folder in place, or a linked worktree).
- `SchedulerService` SHALL pass `nonGit: "scoped_dir"`: each schedule run
  on a non-git project works in its own `scoped-talk-schedule_…` folder under
  the worktree base, removed after the run, never the project folder
  (AGENT-1.c).
- Park and remove SHALL never delete a directory that equals or contains the
  project folder (by realpath, and lexically for a path that no longer
  resolves), whatever kind the caller passes: `parkWorktree` SHALL treat a
  `project_dir` talk or such a dir as let go of (`removed`, nothing
  deleted), `removeWorktree` SHALL return at once for such a dir (a main
  checkout that git refuses to remove is never removed by hand), and the
  scoped-dir setup SHALL refuse such a path.
- Other people's runs only read there: the work tools are offered and run only
  in a git work tree (REQ-plugins-115); the owner's runs keep SAFE-2, the
  verify gate and the SAFE-3.a refusal of the shell, runners and Fledge runs
  (REQ-agent-110), and the file tools never change the folder's root AGENTS.md
  or CLAUDE.md (AGENT-1.b, REQ-plugins-110). `/work` there still opens no PR
  ("this work did not run in a git worktree", REQ-discord-088).
- No new env var, config key, slash command, table, column or schema version.
  Concurrent talks in one non-git folder are not serialized (pending Leif).

Acceptance Criteria
- `tests/discord.nongit-project-dir.test.ts`: `nonGit: "project_dir"` returns the folder itself and creates no `.corvid-worktrees`; a git project still gets a worktree.
- Same file: without `nonGit`, and with `scoped_dir`, a non-git project gets its own scoped folder under the base (AGENT-1.c); `tests/scheduler.owner-role.test.ts` keeps the owner schedule in its own `scoped-talk-schedule_…` folder.
- Same file: `parkWorktree` with every kind on the project folder and on its parent, and `removeWorktree` / `parkWorktree` on a git main checkout, delete nothing; a real scoped dir is still removed.
- Same file: `SessionStore` binds a non-git talk in place (`cwdFor` the folder, kind `project_dir`), a second turn and a restart re-bind it there, ending it, a TTL purge and an expired row at start leave the folder and its files; a legacy scoped-dir row is parked (its dir removed) and re-bound in place; a switch to another project is refused; a folder that became a git repo is re-bound to a linked worktree and its files survive the end of the talk.
- With the base sources these tests fail, except the scoped-folder and the git-project guards, which hold on both.

## Modified

### REQUIREMENT REQ-discord-013

The bridge SHALL make Discord image attachments available to the agent as
local files it can look at (DISCORD-9). Steal shape from corvid-agent
`image-attachments.ts`: MIME allowlist jpeg/png/gif/webp, 20MB size cap, max
5 images per message; download at receive time; multimodal blocks + URL
fallback. Merlin localPath: the bridge SHALL bind the session workspace first
and then write the files inside the directory the agent runs in
(`<session cwd>/.corvidinho/attachments/`, via
`attachmentCacheDir(store.cwdFor(session))`), never under a shared `/tmp`
dir, and SHALL include those paths in the agent prompt via
`enrichPromptWithImages`, so the agent's `files-read` (which refuses paths
outside its cwd) can open them; `files-read` SHALL hand the model the image
itself as an image part, not decoded bytes (REQ-plugins-427 /
REQ-agent-428). The attachment dir SHALL carry a self-ignoring `.gitignore`
so images never land in a commit, and SHALL be removed with the workspace
when the session ends or expires
(SESSION-WORKTREE-3). Non-image / oversized / failed downloads SHALL be
skipped with a notice. The bridge SHALL NOT introduce ProcessManager or
weaken allowlists. Fixture tests SHALL cover extraction and localPath without
a live Discord token or live CDN.

In a talk bound to a non-git project folder itself (`project_dir`,
REQ-discord-110, AGENT-1.a) the workspace is the live project folder and is
never removed, so:

- the owner's images (acting role `owner`) SHALL be written to that
  session's own folder, `<project>/.corvidinho/attachments/<session id>/`
  (`sessionAttachmentDir`), and every end of the talk (`endSession`, a TTL
  purge, an expired row found at start, the re-bind park) SHALL remove that
  folder, and `.corvidinho/attachments` and `.corvidinho` when that left
  them empty, touching only a folder that resolves strictly inside the
  project (`removeSessionAttachments`);
- anyone else's images SHALL reach the run as their URLs only
  (`appendAttachmentUrls`): nothing is downloaded or written there, since
  their runs only read in that folder.

Acceptance Criteria
- Supported image → downloaded + localPath under cache dir; prompt cites path.
- Bridge: the cited path is under `<session cwd>/.corvidinho/attachments/`;
  opening the cited path with `files-read` (with that cwd) gives the model the
  image itself (an image part: `mediaType` `image/png`, base64 that
  round-trips to the downloaded bytes), not decoded bytes; `git status` in the
  talk worktree stays clean; ending the session deletes the file.
- Unsupported MIME / oversize / over-5 → skipped; peers unaffected.
- Fixture tests for appendAttachmentUrls / buildMultimodalContent /
  enrichPromptWithImages; no live token; secrets out of repo; default-deny.
- `tests/discord.nongit-project-dir.test.ts`: in a non-git project the owner's image is cited under `<project>/.corvidinho/attachments/<session id>/`, opens with `files-read` from the project folder, and ending the talk removes it, its folder and the empty `.corvidinho`, leaving the project's files; another person's image reaches the run as its URL only and nothing is written; another session's images survive an end and go at its own TTL purge.
