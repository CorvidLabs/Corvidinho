# Lesson bundle — files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Files path clamp follows dangling symlinks by hand so files-write cannot escape the project root or create SAFE-2 protected files through a link whose target does not exist yet
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/files/resolvePath.ts, tests/files.dangling-symlink.test.ts
- **Acceptance**: files-write through a dangling symlink whose target is outside the project root is refused with a symlink-escape error and the target is not created; through a dangling symlink to a missing SAFE-2 path (.env, specs/*.spec.md) it is refused with SAFE-2 and the file is not created; a dangling directory link cannot carry a nested write outside the root; a symlink loop is refused; a dangling link to a missing file inside the root still writes that in-root file

## Evidence

- Verification commit: `b98e79ac539fa80899d97becce0df75fa46d6319`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Bug report plugins-exec-2 (high). `resolveProjectPath` in
`plugins/files/resolvePath.ts` used `existsSync`, which follows symlinks, so a
dangling symlink looked like a missing path. The walk-up rebuilt the lexical
`<root>/<link>` path, which passes the root check, and `refuseProtected` only
saw lexical names. `files-write` then called `writeFileSync`, which follows
the link and creates its target. Repro: a committed `notes.txt ->
../outside/pwned.txt` let files-write create `outside/pwned.txt`; a
`README.local -> .env` let files-write create `.env` (SAFE-2), while a direct
files-write of `.env` was refused.

Constraints: minimal bug fix; no new env vars or commands; no package bump or
CHANGELOG/STATUS edits. Link text is untrusted data. The git plugin reuses
this clamp as a check only (`clampRel`), so in-root dangling links must keep
working there. Ruled out: refusing every dangling link, because that would
also refuse in-root links, such as staging a new dangling link via git-commit.

## From the change's design.md

# Design

- The walk-up loop uses `lstat` existence (`entryExists`) instead of `existsSync`, so it stops at a dangling link instead of walking past it.
- When the stop point exists by `lstat` but not by `stat`, it is a dangling or looping link. The clamp resolves the link's parent with `realpath` and its text with `readlink`, re-attaches any remaining path segments, and refuses the path if either the link's own directory or the target is outside the root. Otherwise it re-runs the same clamp on the target (`clampUnderRoot`, recursive).
- Hops are capped at 40 (Linux SYMLOOP_MAX). Past that the clamp throws `PathEscapeError` "Symlink loop denied". A link that cannot be read throws "Symlink escape denied".
- The returned path is the resolved target, as for existing links. `refuseProtected` therefore sees the path the write would create (for example `<root>/.env`), and the write goes to that checked path rather than through the link.
- No API, env, or command surface changes. Error type stays `PathEscapeError` (exit 1). The SAFE-2 refusal stays exit 2.

## From the change's testing.md

# Testing

Before the fix, `bun test tests/files.dangling-symlink.test.ts` gave 1 pass and 4 fail: the outside-root write and the `.env` write both returned ok=true and created their targets. After the fix it gives 5 pass and 0 fail. The existing files, git, search and secret-path suites stay green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-082` | `tests/files.dangling-symlink.test.ts` | files-write via a dangling link (absolute and relative) to a missing file outside the root is refused and the target is not created; a dangling directory link with a nested path is refused; a symlink loop is refused; an in-root dangling link still writes its in-root target. |
| `REQ-plugins-082` | `tests/files.dangling-symlink.test.ts` | files-write via a dangling link to a missing `.env` or `specs/x.spec.md` is refused with SAFE-2 (exit 2) and no file is created, because the SAFE-2 check (REQ-plugins-083) now sees the target. |
| `REQ-plugins-082` | `tests/files.plugins.test.ts` | existing escape and symlink-outside-root fixtures still refuse. |

## Where these lessons go

- `specs/plugins/context.md`
