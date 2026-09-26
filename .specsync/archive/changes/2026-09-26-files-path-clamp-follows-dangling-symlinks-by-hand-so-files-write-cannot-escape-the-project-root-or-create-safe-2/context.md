---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: context
---

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
