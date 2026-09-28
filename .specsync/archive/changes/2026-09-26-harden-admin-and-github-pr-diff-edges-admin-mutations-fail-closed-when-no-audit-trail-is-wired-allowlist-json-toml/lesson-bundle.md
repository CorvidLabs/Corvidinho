# Lesson bundle — harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Harden /admin and github-pr-diff edges: /admin mutations fail closed when no audit trail is wired, allowlist JSON/TOML detection shares the loader rule, dangling allowlist symlinks are refused not replaced, empty --file is a usage error, pure rename/copy/mode changes say content unchanged and copies get copy from/to lines
- **Kind**: BugFix
- **Specs**: discord, plugins
- **Paths**: src/discord/command-handlers/admin.ts, src/discord/admin-allowlist.ts, src/discord/slash-types.ts, src/allowlist/load.ts, plugins/github/review.ts, tests/discord.admin-slash.test.ts, tests/github.review.plugin.test.ts
- **Acceptance**: With no audit trail wired (no DB) /admin users/channels mutations reply 'Refused: audit log unavailable (SAFE-5)' and write nothing; /admin and the allowlist loader use one shared case-sensitive .json rule (isJsonAllowlistPath) so allowlist.JSON is edited as TOML; a dangling or looping allowlist symlink is refused by plan, write and config show and is never replaced by a regular file; github-pr-diff --file that is empty after normalization (./, whitespace) is a usage error with no API call; a pure rename/copy/mode change with no patch and 0 line changes says content unchanged instead of binary or too large, and copied files get copy from/to lines; fixture regression tests for each

## Evidence

- Verification commit: `ee8faafac4c8a8ab6b53a7aaa7dde1974a23e805`
- Base commit: `c69e0e2fefdf11d506f55c528035d422973e4f1a`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Bug-fix follow-up (no new features, no new HI) from the reviews of two merged
PRs:

- #147 `/admin` (issue #43, ADMIN-1..4, SAFE-5; REQ-discord-043).
- #153 `github-pr-diff` / `github-pr-files` (issue #93, GITHUB-3;
  REQ-plugins-093).

The reviews found five edge cases:

1. `/admin` fails closed when `recordAudit` throws, but when the bridge has no
   DB, `recordAudit` is unset and the mutation was written with no audit row.
   SAFE-5 says destructive actions leave a tamper-evident trail.
2. `/admin`'s file-format detection lowercased the path (`.JSON` → JSON) while
   the loader (`loadAllowlistFile`) uses a case-sensitive
   `path.endsWith(".json")`. So `allowlist.JSON` was loaded as TOML but edited
   as JSON.
3. `writeFileAtomic` checked `existsSync(path)`, which follows links. On a
   dangling symlink it fell through to `rename(tmp, path)` and replaced the
   operator's symlink with a regular file.
4. `github-pr-diff --file ./` (or whitespace) normalized to `""`, which was
   treated as "no filter" and returned the whole PR diff.
5. A pure rename or mode-only change with no patch was described as "binary
   file, or the file diff is too large", and copied files had no
   `copy from`/`copy to` lines.

Constraints: captured HI only (ADMIN-1..4, SAFE-5, GITHUB-3); no new slash
commands, env vars or product surface. Draft GITHUB-10 (confidence score) is
still left for HI capture.

## From the change's design.md

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

## From the change's testing.md

# Testing

These are fixture tests only: temp dirs, in-memory SQLite, and a mocked
Octokit fetch. There is no network and no token.

- `tests/discord.admin-slash.test.ts`
  - With `recordAudit` unset, `users add` and `channels add` are refused with
    `audit log unavailable (SAFE-5)`, and the file and live lists are
    unchanged. `config show` still works.
  - A dangling symlink and a looping symlink each make `writeFileAtomic`
    throw. The link stays a symlink and its target is not created.
  - `danglingSymlinkError` returns null for a regular file, for a missing path
    and for a link that resolves.
  - `/admin` through a dangling `CORVIDINHO_ALLOWLIST_FILE` link is refused
    with a single `error` audit row, and `config show` says "unreadable".
  - `allowlistFileFormat` agrees with `isJsonAllowlistPath`.
  - An `allowlist.JSON` holding TOML text is edited as TOML and reloads with
    the new user.
- `tests/github.review.plugin.test.ts`
  - `--file ./`, whitespace, `--file=./` and ` ././ ` each give a usage error
    with no API call. `normalizeFileFilter` cases are covered.
  - A pure rename, pure copy and `changed` mode entry say content unchanged,
    not "too large".
  - A copied file with edits keeps its `copy from`/`copy to` lines and the
    patch.
  - Line changes with no patch, and a 0-line `modified` entry, keep the old
    note.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | unset `recordAudit` refuses users/channels add with `audit log unavailable (SAFE-5)` and leaves file + live lists unchanged; dangling and looping symlinks are refused by `/admin`, `writeFileAtomic` and `config show` with the link kept; `allowlist.JSON` is edited as TOML and reloads; existing ADMIN-1..4 tests pass. |
| `REQ-plugins-093` | `tests/github.review.plugin.test.ts` | `--file ./`, whitespace, `--file=./` and ` ././ ` return a usage error with no API call; pure rename/copy/`changed` entries say content unchanged, copies get `copy from`/`copy to`; existing diff/files/scrub tests pass. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
