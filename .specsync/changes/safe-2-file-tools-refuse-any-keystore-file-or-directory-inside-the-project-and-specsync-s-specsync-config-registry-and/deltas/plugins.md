---
module: plugins
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
---

# Delta — plugins (SAFE-2 keystore directories and .specsync/ state)

## Modified

### REQUIREMENT REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, SpecSync state under `.specsync/` (config, registry,
version, archive) except the active change folders under `.specsync/changes/`
(which stay writable so change artifacts can be filled, SPECSYNC-4), and any
path component inside the project containing `keystore` (a keystore file such
as `wallet-keystore.json` or any file under a keystore directory such as
`keystore/UTC--…`). Components of the project root's own absolute path SHALL
NOT be matched against `keystore`, so a project checked out under a
keystore-named directory keeps its ordinary files writable.

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.
- files-write, files-edit and files-delete of a file under a keystore directory (`keystore/UTC--…`, `config/Keystore/wallet.json`), a new file there, or a symlink resolving into one are refused with SAFE-2 (exit 2) and the file is unchanged / not created.
- files-write, files-edit and files-delete of `.specsync/config.toml`, `.specsync/registry.toml`, a new `.specsync/` top-level file or a `.specsync/archive/` file are refused with SAFE-2 (exit 2); a file under `.specsync/changes/<id>/` is still written.
- In a project whose root directory name contains `keystore`, files-write (relative or absolute path) and files-edit of ordinary files succeed, and `keystore/…` inside it is still refused.
- git-commit refuses to stage the deletion of `.specsync/config.toml` (exit 2, SAFE-2) and stages the deletion of a `.specsync/changes/<id>/` file.
