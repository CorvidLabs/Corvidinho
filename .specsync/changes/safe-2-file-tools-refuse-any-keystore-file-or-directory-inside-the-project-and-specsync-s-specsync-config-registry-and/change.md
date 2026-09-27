---
id: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
state: approved
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# SAFE-2: file tools refuse any keystore file or directory inside the project and SpecSync's .specsync/ config, registry and archive (active change folders stay writable)

## Intent

SAFE-2: file tools refuse any keystore file or directory inside the project and SpecSync's .specsync/ config, registry and archive (active change folders stay writable)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- files-write, files-edit and files-delete refuse (exit 2, SAFE-2, file unchanged / not created) any path with a component containing 'keystore' inside the project (keystore/UTC--..., config/Keystore/wallet.json, a symlink into a keystore dir); they also refuse .specsync/ config, registry, version and archive files; files under the active change folders .specsync/changes/ stay writable; a project checked out under a keystore-named directory can still write its ordinary files; git-commit refuses staging the deletion of .specsync/config.toml but stages the deletion of an archived change's .specsync/changes/<id>/ files

## No-spec Rationale

Not applicable
