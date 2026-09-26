---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: testing
---

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
