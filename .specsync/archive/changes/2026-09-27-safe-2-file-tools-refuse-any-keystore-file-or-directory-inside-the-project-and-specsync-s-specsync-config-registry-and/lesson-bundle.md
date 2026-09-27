# Lesson bundle — safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-2: file tools refuse any keystore file or directory inside the project and SpecSync's .specsync/ config, registry and archive (active change folders stay writable)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/files/protectedPaths.ts, plugins/files/commands.ts, tests/files.plugins.test.ts, tests/git.plugins.test.ts, specs/plugins/requirements.md, specs/plugins/plugins.spec.md
- **Acceptance**: files-write, files-edit and files-delete refuse (exit 2, SAFE-2, file unchanged / not created) any path with a component containing 'keystore' inside the project (keystore/UTC--..., config/Keystore/wallet.json, a symlink into a keystore dir); they also refuse .specsync/ config, registry, version and archive files; files under the active change folders .specsync/changes/ stay writable; a project checked out under a keystore-named directory can still write its ordinary files; git-commit refuses staging the deletion of .specsync/config.toml but stages the deletion of an archived change's .specsync/changes/<id>/ files

## Evidence

- Verification commit: `f9a4198518d79773a09ef1d06e5c90d392d48aff`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- `isProtectedPath(filePath, root?)`: the component loop adds `.specsync` (case-insensitive) unless the path is a file inside a change folder (`.specsync/changes/<id>/…`); `.specsync/changes` and `.specsync/changes/<id>` themselves stay protected, so a file planted where SpecSync needs a folder cannot switch `specsync change new` off (SPECSYNC-4). The keystore rule becomes "any component contains `keystore`" (subsuming the old basename and `wallet-keystore.json` checks), read over the components below `root` when `root` is given with an absolute path inside it; otherwise over the whole path.
- `hasKeystoreComponent(parts)` (exported) is the keystore component rule. It skips a SpecSync change folder's name (`.specsync/changes/<id>/`, `.specsync/archive/changes/<id>/`): SpecSync derives the id from the change title, so a change about keystores (this one) would otherwise make its own artifacts unwritable and its archive move unstageable. Components below the change folder still count.
- `refuseProtected(userPath, absPath, cwd)` passes `realRoot(cwd)` for both checks, so an absolute user path or the resolved path is judged on its in-project components for the keystore rule; `.git` / `.env*` / `specs` / `.specsync` still read the whole path as before.
- `protectedRefuseMessage` lists `.specsync` among the protected kinds.
- `git-commit` (REQ-plugins-182) reuses `isProtectedPath` on repo-relative paths, so it now also refuses staging the deletion of `.specsync/` state and of files in keystore directories; deletions under `.specsync/changes/<id>/` still stage. Its secret-bearing staging refusal used the keystore basename only, so `keystore/UTC--…` could be committed; it now uses `hasKeystoreComponent` on the repo-relative path (REQ-plugins-182 already said "any keystore path").
- Design choice pending Leif: `.specsync/` is protected as SAFE-2 "specs" infra except the active change folders `.specsync/changes/`, which stay writable so the agent can fill change artifacts (SPECSYNC-4). Machine state inside an active change (`state.json`, `approvals.json`) is therefore still writable by the file tools.
- No new env var, command, flag, config key or schema change.

## From the change's testing.md

# Testing

With main's `plugins/files/protectedPaths.ts`, `plugins/files/commands.ts` and
`plugins/git/commands.ts` swapped in, `bun test tests/files.plugins.test.ts
tests/git.plugins.test.ts` gives 37 pass and 5 fail (the five new tests); with
this change it gives 42 pass and 0 fail. `tests/files.secret-path.test.ts`
stays green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-083` | `tests/files.plugins.test.ts` "SAFE-2: any keystore path component and .specsync/ state are protected" | `isProtectedPath` is true for `keystore/key.json`, `config/Keystore/a.json`, `.specsync/config.toml`, `.specsync/archive/changes/x/approvals.json`; false for `.specsync/changes/x/tasks.md`; with `root = /home/u/keystore-tools`, `<root>/src/a.ts` is false and `<root>/keystore/k.json` is true. |
| `REQ-plugins-083` | `tests/files.plugins.test.ts` "SAFE-2: write/edit/delete refuse files in a keystore directory and .specsync/ state" | files-write / files-edit / files-delete of `keystore/UTC--…`, `config/Keystore/wallet.json`, `.specsync/config.toml`, `.specsync/registry.toml`, `.specsync/archive/changes/old/approvals.json` exit 2 with SAFE-2 and leave `ORIGINAL`; new `keystore/new.json` and `.specsync/new.toml` are not created; a symlink into the keystore dir is refused; `.specsync/changes/open/tasks.md` is written. |
| `REQ-plugins-083` | `tests/files.plugins.test.ts` "SAFE-2: a project under a keystore-named directory stays writable outside its own keystores" | in a `corvidinho-keystore-tools-*` temp root, files-write of `src/a.ts` (relative and absolute) and `notes.md` and files-edit of `src/a.ts` succeed; `keystore/k.json` is refused and not created. |
| `REQ-plugins-083` | `tests/git.plugins.test.ts` "SAFE-2: .specsync/ state deletes are refused; an archived change's folder delete stages" | git-commit of a deleted `.specsync/config.toml` exits 2 with SAFE-2 and it stays tracked; git-commit of a deleted `.specsync/changes/done/state.json` succeeds. |
| `REQ-plugins-083` | same two `tests/files.plugins.test.ts` tests (review additions) | `.specsync/changes`, `.specsync/changes/x`, `.specsync/changes/.gitkeep` are protected and files-write of `.specsync/changes` / `.specsync/changes/next` in a project without them exits 2 and creates nothing; `.specsync/changes/fix-keystore-dirs/tasks.md` is not protected and files-write of `.specsync/changes/safe-2-refuse-keystore-dirs/tasks.md` succeeds; `.specsync/changes/fix-keystore-dirs/keystore/UTC--a` stays protected. |
| `REQ-plugins-182` | `tests/git.plugins.test.ts` "keystore directories are never staged; a change id that mentions keystores archives" | git-commit of `keystore/UTC--…` and `config/Keystore/wallet.json` exits 2 and stages nothing; git-commit of `.specsync/changes/safe-2-refuse-keystore-dirs/state.json`, then of its deletion plus the `.specsync/archive/changes/…` copy, succeeds. |
| `REQ-plugins-083` | `tests/files.plugins.test.ts` existing SAFE-2 tests | `.env`, `fledge.toml`, `specs/x.spec.md`, `wallet-keystore.json`, `bunfig.toml` refusals and ordinary writes still pass. |

## Where these lessons go

- `specs/plugins/context.md`
