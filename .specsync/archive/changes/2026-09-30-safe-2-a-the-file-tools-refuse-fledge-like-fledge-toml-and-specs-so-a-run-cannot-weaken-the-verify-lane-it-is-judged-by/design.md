---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: design
---

# Design

One rule in the existing list, no new module, flag, env var, config key,
table or command:

- `isProtectedPath` gains `if (lower === ".fledge") return true;` in the
  component loop next to `.git` / `.env*` / `specs`. Like those exact-name
  rules it reads the whole path, case-folded, so `.fledge` itself (a file
  planted where Fledge needs the folder), anything under it at any depth,
  `./` and `..` spellings and `.FLEDGE/…` are all refused.
- Every writer already routes through that list, so no call site changes:
  `files-write` / `files-edit` / `files-delete` check the path as given and
  the resolved path (`resolveProjectPath` follows symlinks, and dangling
  links by hand), so a link to a lane file, a path through a link to
  `.fledge/lanes` and a dangling link to a missing lane file are refused;
  `/work` runs (owner and team) and `delegate` workers use these same tools
  through `runPlugin`; `git-commit` refuses staging the deletion of a
  protected path; `discord-send-file` (read-only) refuses the SAFE-2 set, so
  it now refuses `.fledge/` as it already refuses `fledge.toml`.
- The refusal is the same SAFE-2 text (`protectedRefuseMessage`); its
  parenthetical list of protected kinds now names `.fledge`.
- Reads stay allowed: `files-read`, `files-list`, `files-glob`,
  `search-grep` and `fledge-lanes-list` / `-validate` do not consult the list.

Conservative choices (listed for Leif): the rule matches a `.fledge`
component anywhere in the path (like `specs` / `.git`), not only at the
project root, and in any letter case; `discord-send-file` refuses `.fledge/`
along with the rest of SAFE-2.
