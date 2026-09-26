---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "parseSimpleToml reads multi-line orgs/repos/deny_repos/deny_orgs with trailing commas and comments", "file deny_repos spanning lines wins over an env allow org (GITHUB-6)" and "multi-line file lists load for github and discord gates" all failed on main (lists came back empty and `corvidlabs/secret` was admitted). They pass now. |
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "single-line files read exactly as before": 5 corpus files (quotes, bare words, trailing comma, comments, mixed-case keys and sections, `[owner]`, CRLF, the /admin header, `allowlist.example.toml`) give the same result as the previous reader, which is kept in the test. |
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "anything unparseable in an allow/deny section fails closed": 20 malformed inputs throw (unterminated array at EOF, before a header or a key; missing, double or leading comma; unterminated string; text after `]`; empty value; nested array; `"""`; unsupported escape; hyphenated, quoted or dotted key; stray continuation line; malformed, `[[…]]` or quoted header). The error names the line and key, not the values. `loadAllowlistFile` reports an error, and `loadAllowlist` rejects for bad TOML and bad JSON, while a missing file still means env only. All of these failed on main. |
| `REQ-plugins-006` | `tests/git.plugins.test.ts` | "a multi-line file deny_repos refuses; a malformed file never falls back to env allow": `git-push` exits 3 ("denied") for a multi-line file `deny_repos` with env allow `acme`, and refuses with the allowlist-file error for a malformed file. The remote ref stays absent. On main the push went through. |
| `REQ-discord-004` | `tests/allowlist.toml-multiline.test.ts` | "bridge config keeps a multi-line deny_channels" and "bridge and watch refuse to start on a malformed file (code allowlist)". Both failed on main: `deny_channels` was empty, and the bridge and watch started. |
| `REQ-discord-004` / `REQ-discord-043` | `tests/allowlist.toml-multiline.test.ts` | "/admin users add keeps existing multi-line entries and every deny list". On main, `fileBefore` was `[]`, so the write would drop `333` and `555`. The reloaded file now has `users` 333, 555, 666 and keeps `deny_users` and `[github].deny_repos`. "a malformed file is refused, not clobbered": the plan fails with "could not be parsed" and the file is byte-identical. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | Existing /admin suite (30 tests) passes. For its `{ not json` case, the fixture now models a file that broke after bridge start, since the loader refuses such a file at start. |
