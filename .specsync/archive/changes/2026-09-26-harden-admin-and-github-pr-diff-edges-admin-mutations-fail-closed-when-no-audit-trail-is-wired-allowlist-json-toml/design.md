---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: design
---

# Design

- **(a) Audit fail-closed.** `handleMutation` in
  `src/discord/command-handlers/admin.ts` records the `started` row in one
  `try` block. When `ctx.recordAudit` is unset it throws "no audit database is
  wired to this bridge", so both cases give the same
  `Refused: audit log unavailable (SAFE-5): … Nothing changed.` reply before
  any write. `startedSeq` is now always a number. No-op and refusal replies
  are unchanged, and so is the read-only `config show`.
- **(b) One format rule.** `isJsonAllowlistPath(path)` (case-sensitive
  `.json`) is exported from `src/allowlist/load.ts`. `loadAllowlistFile` and
  `allowlistFileFormat` in `src/discord/admin-allowlist.ts` both call it.
- **(c) Dangling symlinks.** `danglingSymlinkError(path)` uses `lstat` to spot
  a symlink, then `realpath` to check that it resolves. If it does not, it
  returns an error naming the `readlink` target. `planAdminListChange` and
  `readAdminFileView` return it as `ok: false` (so `/admin` refuses before the
  `started` row, and `config show` prints "unreadable: …"). `writeFileAtomic`
  throws it as defence in depth. We refuse rather than create the target
  because the loader reads a dangling link as "no file", and creating a file
  wherever the link points would hide a misconfiguration (for example an
  unmounted volume).
- **(d) Empty `--file`.** `normalizeFileFilter` in `plugins/github/review.ts`
  returns `undefined` when the flag is absent, else the value trimmed and
  stripped of every leading `./`. The handler refuses `""` with
  `--file needs a file path; usage: …` (exit 1) before building a client.
- **(e) No-patch wording.** `noPatchNote(f)` returns a content-unchanged
  note when there is no patch and 0 additions, deletions and changes, and the
  status is `renamed`, `copied` or `changed`. The rename and copy notes say
  "unless the file is binary", because GitHub also reports 0 lines for
  binaries. Every other case keeps the old binary/too-large note.
  `fileDiffSection` adds `copy from`/`copy to` lines for `copied`.

The hot shared files get no edits except a doc comment in
`src/discord/slash-types.ts`. No schema change, no new persisted text.
