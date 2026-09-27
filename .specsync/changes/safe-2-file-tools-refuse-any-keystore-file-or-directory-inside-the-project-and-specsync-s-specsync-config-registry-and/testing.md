---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: testing
---

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
