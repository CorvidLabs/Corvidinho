---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: context
---

# Context

Part of #84 (AGENT-1). Slice nongit-owner of the M3/M4 plan
(`/home/user/coord/pr-nongit-owner.json`).

Leif confirmed AGENT-1.a in the 2026-09-28 interview (round 8: "owner runs of
a non-git project work in the project folder itself (SAFE-2 + verify gate);
non-owner runs read-only there"); it is captured on main in `hi/agent.md`.
In round 13 (2026-09-30) he decided two design calls, captured in this PR
with `hi` as sub-criteria of AGENT-1: AGENT-1.b ("In a project folder that
isn't a git repo, its file tools can't change the root AGENTS.md or
CLAUDE.md; I edit those myself.") and AGENT-1.c ("My schedules for a project
that isn't a git repo work in their own separate folder, never in the live
project folder.").

What was wrong on main (cf7f61b): every Discord talk in a project that is not
a git repo got an empty scoped folder under `.corvid-worktrees`
(`ensureTalkWorkspace`), so the owner's runs never saw or changed the project
itself (AGENT-1: "works from that project's own config and tools, not from
some global sandbox of its own"), and anyone's `/work` could write in its
scoped folder. A session row whose path was the project folder would have been
parked as a scoped dir, which is `rmSync(recursive)` — and `removeWorktree`
on a main checkout falls back to `rmSync` when git refuses. In a non-git
project the AGENT-1 loader reads the root AGENTS.md / CLAUDE.md from disk, so
a file tool that could change them could plant system-prompt instructions for
every later run there.

Constraints: smallest change on the existing worktree manager, session store,
roles gate and files plugin; schedules unchanged (AGENT-1.c); no new env var,
config key, slash command, table or schema bump; specs only through SpecSync;
#232/#233 untouched; v1 off-chain. Out (pending Leif): per-folder
serialization of concurrent owner runs in one non-git folder.
