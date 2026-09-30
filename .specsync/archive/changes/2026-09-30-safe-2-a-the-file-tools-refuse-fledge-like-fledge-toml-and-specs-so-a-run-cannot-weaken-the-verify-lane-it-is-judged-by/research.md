---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: research
---

# Research

- Writers that consult the protected list (`grep isProtectedPath` over
  `src/` and `plugins/`): `plugins/files/commands.ts` (`refuseProtected`, used
  by files-write / files-edit / files-delete), `plugins/git/commands.ts`
  (`stagingRefusal`, deleted paths), `plugins/discord/send-file.ts`
  (`refusedPath`, read-only). No other module keeps its own copy of the list.
- `/work` (owner and team, IDENTITY-10) and `delegate` workers reach the file
  tools only through `runPlugin`, so the handler check covers them.
- Fledge lane sources: `fledge.toml` and `.fledge/lanes/*.toml`
  (`plugins/fledge/core.ts` `LANES_DIR`, `src/doctor.ts` verify-lane check).
- Existing SAFE-2 tests for `specs/`, `.specsync/` and keystores cover:
  write / edit / delete of existing and new files, a symlink resolving into
  the protected dir, a file planted where the protected folder belongs, case
  folding, and git-commit deletion staging. The new `.fledge/` tests mirror
  each of these and add absolute, `./`, `src/../` and dangling-link spellings.
- Out of scope (not file tools): `shell-exec`, the language runners and
  `fledge-run` / `fledge-lanes-run` can write any file; they are owner-only,
  allowlisted and worktree-clamped (SAFE-3.a), as for `fledge.toml` today.
