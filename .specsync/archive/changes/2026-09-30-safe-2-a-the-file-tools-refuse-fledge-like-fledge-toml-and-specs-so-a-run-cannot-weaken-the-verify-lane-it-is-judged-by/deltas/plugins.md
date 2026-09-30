---
module: plugins
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
---

# Delta: plugins (SAFE-2.a: the file tools refuse .fledge/)

## Modified

### REQUIREMENT REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, any `.fledge` path component (Fledge lane imports
and config such as `.fledge/lanes/*.toml`, which the verify gate runs, so a
run cannot weaken the checks it is verified by: SAFE-2.a; reads stay
allowed), basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, SpecSync state under `.specsync/` (config, registry,
version, archive, and `.specsync/changes` / `.specsync/changes/<id>`
themselves) except the files inside an active change folder
`.specsync/changes/<id>/` (which stay writable so change artifacts can be
filled, SPECSYNC-4), and any path component inside the project containing
`keystore` (a keystore file such as `wallet-keystore.json` or any file under a
keystore directory such as `keystore/UTC--…`). Components of the project
root's own absolute path SHALL NOT be matched against `keystore`, so a project
checked out under a keystore-named directory keeps its ordinary files
writable; nor SHALL a SpecSync change folder's name (`.specsync/changes/<id>/`,
`.specsync/archive/changes/<id>/`), which is a slug of the change title.

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.
- files-write, files-edit and files-delete of a file under a keystore directory (`keystore/UTC--…`, `config/Keystore/wallet.json`), a new file there, or a symlink resolving into one are refused with SAFE-2 (exit 2) and the file is unchanged / not created.
- files-write, files-edit and files-delete of `.specsync/config.toml`, `.specsync/registry.toml`, a new `.specsync/` top-level file or a `.specsync/archive/` file are refused with SAFE-2 (exit 2); a file under `.specsync/changes/<id>/` is still written, also when `<id>` contains `keystore`; files-write of `.specsync/changes` or `.specsync/changes/<id>` itself is refused and nothing is created.
- In a project whose root directory name contains `keystore`, files-write (relative or absolute path) and files-edit of ordinary files succeed, and `keystore/…` inside it is still refused.
- git-commit refuses to stage the deletion of `.specsync/config.toml` (exit 2, SAFE-2) and stages the deletion of a `.specsync/changes/<id>/` file.
- files-write, files-edit and files-delete of a file under `specs/` that does not end in `.spec.md` (`specs/agent/requirements.md`, `specs/agent/context.md`) and files-write of a new `specs/notes.md` are refused with SAFE-2 (exit 2); the files are unchanged and the new file is not created (the test fails with the `specs` component rule removed).
- files-write, files-edit and files-delete of `.fledge/lanes/verify.toml` and `.fledge/config.toml` (also spelled `./.fledge/…`, `src/../.fledge/…`, `.FLEDGE/…` or as an absolute path, through a symlink to the lane file or a symlink to `.fledge/lanes`), files-write of a new `.fledge/lanes/extra.toml`, of a dangling symlink to a missing lane file and of `.fledge` itself in a project without one are refused with the SAFE-2 refusal (exit 2, text names `.fledge`); the files are unchanged and nothing is created; files-read and files-list of `.fledge/` still work (SAFE-2.a; the test fails with the `.fledge` component rule removed).
- git-commit refuses to stage the deletion of a tracked `.fledge/lanes/verify.toml` or `.fledge/config.toml` (exit 2, SAFE-2); the path stays in `ls-files` and nothing is staged (SAFE-2.a; fails with the `.fledge` rule removed).
