---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: requirements
---

# Requirements

- SAFE-2 (captured in `hi/safe.md`): the agent cannot delete or overwrite protected project infra (env files, git metadata, fledge.toml, specs, keystores) through its file tools.
- SPECSYNC-4 (captured in `hi/specsync.md`) bounds the `.specsync/` rule: the agent must still be able to work inside the change shape, so active change folders stay writable.
- Modify REQ-plugins-083 (delta `deltas/plugins.md`): any in-project path component containing `keystore` and `.specsync/` state outside `.specsync/changes/` are hard-refused by files-write / files-edit / files-delete; a keystore-named project root does not make the project read-only.
- No new REQ, env var, command, schema or package version.
