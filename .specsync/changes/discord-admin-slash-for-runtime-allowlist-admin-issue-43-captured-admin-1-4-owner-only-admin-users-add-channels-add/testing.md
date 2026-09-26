---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: testing
---

# Testing

- `tests/discord.admin-slash.test.ts` (fixtures: temp allowlist files,
  in-memory SQLite audit chain, no token or network):
  - body shape (groups, pickers) and nine command names;
    `flattenSlashOptions` for groups, subcommands and top-level options;
  - non-owner refused at dispatch, no owner ⇒ nobody, handler re-check when
    called directly (audited `denied`), muted / deny-listed owner refused,
    deny tip names `/admin channels add`;
  - users add: only the users line changes (comments, `[github]`, `[owner]`
    verbatim), live array spliced in place, first-user warning, audit
    `started` + `ok` with digest only and a valid chain, reload and owner
    load after the write; no-op second add; no warning when roles gate;
    deny-listed refused; invalid id → usage; env-sourced user noted; audit
    unavailable ⇒ fail closed;
  - channels add is live (the new channel passes the slash gate), deny-listed
    refused, remove drops it (warns when run in that channel), last channel
    refused, env-only refused, file+env removes from the file only, unknown →
    no-op;
  - config show: counts by source, owner display without id, updatable
    knobs, no token / HMAC key in output; unknown route;
  - writer: missing file created 0600, path resolution order, atomic write
    keeps mode / follows symlink / leaves no temp file, TOML multi-line /
    missing key / missing section / CRLF / other-section key, JSON keeps
    owner and refuses lossy numbers and bad JSON, env never written to file.
- Updated: `tests/discord.register-commands.test.ts`,
  `tests/discord.announce.test.ts`, `tests/discord.session-worktree.test.ts`
  (nine commands).
- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-043 | `tests/discord.admin-slash.test.ts` |
| REQ-discord-009 | `tests/discord.register-commands.test.ts`, `tests/discord.admin-slash.test.ts` (body shape), `tests/discord.session-worktree.test.ts`, `tests/discord.announce.test.ts` |
