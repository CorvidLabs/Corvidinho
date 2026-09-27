---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: context
---

# Context

Scoping record w10 rank 4 (SAFE-2). `isProtectedPath` in
`plugins/files/protectedPaths.ts` matched `keystore` only in the basename, so
`isProtectedPath('keystore/key.json')` was false while `isSecretPath` (the
ROLES-CHAT-8 read gate) already treats any `*keystore*` component as secret.
`files-write` / `files-edit` (not dangerous, offered to ADMIN at code tier)
could therefore overwrite a file in a keystore directory such as
`keystore/UTC--…`, and `files-delete` could remove it. SpecSync's own state
(`.specsync/config.toml`, `registry.toml`, `archive/`) was not protected either,
so a file tool could flip `enforcement` or drop a module from the registry.

Repro on main (fbaa84b): in a temp project, `files-write keystore/UTC--key.json
HACKED` and `files-write .specsync/config.toml HACKED` both returned ok and the
files read `HACKED` afterwards.

Captured HI (`hi/safe.md`): "SAFE-2 The agent cannot delete or overwrite
protected project infra (env files, git metadata, fledge.toml, specs,
keystores) through its file tools." SPECSYNC-4 (`hi/specsync.md`): "If the
project uses the verified change workflow, the agent can work inside that
shape without turning the change machinery off."

Constraints: smallest slice; no new env var, command or schema; no package
bump or CHANGELOG edit. Open PRs #232 / #233 (Discord ask-button gates, SAFE-3
clamp) are out of scope and untouched.
