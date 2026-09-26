# Lesson bundle — allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped
- **Kind**: BugFix
- **Specs**: plugins, discord, cli
- **Paths**: src/allowlist/load.ts, src/discord/config.ts, tests/allowlist.toml-multiline.test.ts, tests/git.plugins.test.ts, tests/discord.admin-slash.test.ts, allowlist.example.toml, specs/plugins/plugins.spec.md, src/allowlist/index.ts, src/cli.ts, src/discord/admin-allowlist.ts, src/plugins/githubDeny.ts, src/plugins/githubPublic.ts, plugins/discord/index.ts, plugins/git/commands.ts, tests/github.gate-allowlist-file.test.ts
- **Acceptance**: A multi-line [github]/[discord] array in the allowlist TOML file (trailing comma and # comments allowed) loads every item, so a file deny_repos/deny_orgs spanning lines refuses the repo even when env allow admits its org (GITHUB-6); single-line files parse exactly as before; any line or value in [github]/[discord]/top level the parser cannot read (unterminated or malformed array/string, bad key or header) throws, loadAllowlist throws instead of falling back to env-only for any file that exists but cannot be read or parsed, and the bridge (code allowlist), watch, daemon, git-push and the repo gates refuse; /admin reads multi-line users/channels and its rewrite reloads with every entry and deny list intact

## Evidence

- Verification commit: `c7191d5c588af57a410840e8efb6f670f8f2a97f`
- Base commit: `e8bbd215036e7dc8739ac9159afa19f17ae943c6`
- Verified by: `specsync check --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Found in review of PR #191. The allowlist loader's TOML reader
(`parseSimpleToml` in `src/allowlist/load.ts`) worked one line at a time. For
`key = [` with nothing else on the line it stored an empty list, and then
skipped the continuation lines because they are not `key = value`. So an
operator file like

```toml
[github]
orgs = ["corvidlabs"]
deny_repos = [
  "corvidlabs/secret",
]
```

loaded with `deny_repos = []`, and `corvidlabs/secret` was admitted. That is a
fail-open for deny lists (GITHUB-6, ALLOW-1/2/5; ALLOW-3 / DISCORD-5 for
`deny_channels` / `deny_users`). The loader feeds WATCH, the daemon, the
Discord bridge config, `resolveActingIsAdmin`, `discord-post-message`,
`git-push` and, once #191 lands, the GitHub plugin gate.

Repro on main (`e8bbd21`): loading the file above gave `denyRepos: []` and
`isRepoAllowed("corvidlabs/secret")` returned `{ ok: true }`. `git-push` with
`CORVIDINHO_GITHUB_ALLOW_ORGS=acme` and a multi-line file
`deny_repos = [ "acme/widget", ]` pushed the branch.

A second gap: when the file existed but failed to load (bad JSON, unreadable),
`loadAllowlist` dropped the whole file and still merged the env overlays. Any
env allow then admitted what the file denied.

## From the change's design.md

# Design

- `parseSimpleToml` keeps its signature. It now walks the file with a row index:
  - Header lines `[name]` (letters, digits, `_`, `.`, `-`; spaces around the name allowed) open that section. Another balanced one- or two-bracket header (`[my notes]`, `[[rules]]`, `['x']`) opens an unrelated lenient section, unless its name mentions github or discord (`[[github]]`, `["discord"]`), holds `,` or `=` (a stray array line), or is unbalanced (`[github`, `[[rules]`): those throw. The github/discord forms used to leave the following keys in the previous section.
  - A `deny…` key (any spelling) at the top level or in any section other than `[github]` / `[discord]` throws: the loader would ignore it, so a deny list could be dropped by a misplaced header.
  - Any Unicode whitespace separates tokens, so a pasted U+00A0 does not stop the bot.
  - In `[github]`, `[discord]` and the top level, a line must be `key = value` with a bare key (`[A-Za-z0-9_]+`). A value starting with `[` is scanned as an array that may span lines. Items are quoted strings (`"…"` with only `\"` / `\\` escapes, or `'…'`) or bare words. A trailing comma and `#` comments between items are allowed. Leading or double commas, missing commas, nested arrays, text after `]`, an unterminated string, or reaching EOF, a `[header]` or a `key =` line before `]` all throw. A quoted item that holds commas is split on them, as the single-line reader always did, so `["a/x, a/y"]` still denies both.
  - Any other value is a one-line quoted or bare list, split on commas and whitespace as before. An empty value, text after the closing quote, or stray quotes, brackets or `=` throw.
  - Other sections (`[owner]` and unknown ones) keep the old lenient one-line reading, because identity/owner.ts parses `[owner]` itself and its display names may hold any text.
  - Errors read `allowlist TOML line N: [section].key: <problem>` and never include values.
- `loadAllowlistFile` still returns `{ ok: false, error }`. `loadAllowlist` now throws when a file that exists fails to load (TOML or JSON). It used to drop the file silently and merge the env overlays. A missing file (or `filePath: null`) is unchanged: env overlays only.
- The reader is `scanSimpleToml`, which also returns each key's first and last row; `parseSimpleToml` is built on it. `parseAllowlistText(text, path)` is the loader's view of file text (JSON or TOML); `loadAllowlistFile` uses it.
- `loadBridgeConfig` catches the throw and returns `code: "allowlist"`, as `loadWatchConfig` already does. The daemon's start and roles.ts already refuse on a throw.
- Action gates use `tryLoadAllowlist`, which returns `{ ok: false, error }` instead of throwing: `checkRepoGateAsync` and `checkRepoGateForActingRole` (#191's GitHub gate, now on main) return `GITHUB-6: refused — <loader error>` (exit 3 in the plugins), `git-push` returns the same with exit 3, and `discord-post-message` returns `not authorized: <loader error>` with exit 3. No stack traces reach the CLI or the agent.
- `corvidinho doctor` adds an `allowlist-file` check: `[fail]` with the loader's error for a file that does not load, `[ok]` when it loads, `[info]` when there is none.
- /admin: `setTomlDiscordList` now locates lines with `scanSimpleToml`, so a new key goes after the closing `]` of the last value in the first `[discord]` (it used to land inside a multi-line array and break the file), and quoted `]` / `#` are handled. `planAdminListChange` re-reads the rewrite with `parseAllowlistText` and `parseSimpleToml` and refuses, writing nothing, unless it loads, the edited list reads back as `fileAfter` and every other list and key is unchanged. A file the reader rejects is still refused with "could not be parsed".
- No new env var, config key, slash command or plugin.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "parseSimpleToml reads multi-line orgs/repos/deny_repos/deny_orgs with trailing commas and comments", "file deny_repos spanning lines wins over an env allow org (GITHUB-6)" and "multi-line file lists load for github and discord gates" all failed on main (lists came back empty and `corvidlabs/secret` was admitted). They pass now. |
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "single-line files read exactly as before": 5 corpus files (quotes, bare words, trailing comma, comments, mixed-case keys and sections, `[owner]`, CRLF, the /admin header, `allowlist.example.toml`) give the same result as the previous reader, which is kept in the test. |
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "anything unparseable in an allow/deny section fails closed": 20 malformed inputs throw (unterminated array at EOF, before a header or a key; missing, double or leading comma; unterminated string; text after `]`; empty value; nested array; `"""`; unsupported escape; hyphenated, quoted or dotted key; stray continuation line; malformed, `[[…]]` or quoted header). The error names the line and key, not the values. `loadAllowlistFile` reports an error, and `loadAllowlist` rejects for bad TOML and bad JSON, while a missing file still means env only. All of these failed on main. |
| `REQ-plugins-006` | `tests/git.plugins.test.ts` | "a multi-line file deny_repos refuses; a malformed file never falls back to env allow": `git-push` exits 3 ("denied") for a multi-line file `deny_repos` with env allow `acme`, and for a malformed file exits 3 with `GITHUB-6: refused — allowlist file unreadable or malformed … line 2: [github].deny_repos` (no values, no throw). The remote ref stays absent. On main the push went through. |
| `REQ-plugins-006` | `tests/allowlist.toml-multiline.test.ts` | "unrelated sections stay lenient, loose headers included" (`[my notes]`, `[[rules]]`, `['quoted']`), "a pasted non-breaking space (U+00A0) is whitespace", and 8 more malformed inputs that throw (deny key at the top level, in another section, under a loose header, hyphenated in another section; loose header naming discord; `[[discord]]`; stray `["b", "c"]` line; unbalanced `[[rules]`). |
| `REQ-plugins-006` / `REQ-cli-042` | `tests/allowlist.toml-multiline.test.ts` | "discord-post-message refuses with exit 3 and the file error" (was a thrown error) and "corvidinho doctor fails the allowlist-file check with the parse error" (`[fail]` with line/key and no values; `[ok]` once fixed; `[info]` with no file). |
| `REQ-plugins-253` | `tests/github.gate-allowlist-file.test.ts` | "a malformed or unreadable allowlist file makes the gate refuse, even with an env allow list": truncated JSON, a TOML deny list missing its `]`, and a directory; with and without env `CORVIDINHO_GITHUB_ALLOW_ORGS`, `checkRepoGateForActingRole`, `checkRepoGateAsync` and github-issue-create refuse (exit 3, `GITHUB-6: refused — allowlist file unreadable or malformed`); the TOML error names `line 3: [github].deny_repos` and not the values. On the merge with main before this fix the gate threw. |
| `REQ-discord-004` | `tests/allowlist.toml-multiline.test.ts` | "bridge config keeps a multi-line deny_channels" and "bridge and watch refuse to start on a malformed file (code allowlist)". Both failed on main: `deny_channels` was empty, and the bridge and watch started. |
| `REQ-discord-004` / `REQ-discord-043` | `tests/allowlist.toml-multiline.test.ts` | "/admin users add keeps existing multi-line entries and every deny list". On main, `fileBefore` was `[]`, so the write would drop `333` and `555`. The reloaded file now has `users` 333, 555, 666 and keeps `deny_users` and `[github].deny_repos`. "a malformed file is refused, not clobbered": the plan fails with "could not be parsed" and the file is byte-identical. |
| `REQ-discord-004` / `REQ-discord-043` | `tests/allowlist.toml-multiline.test.ts` | "/admin rewrites around other multi-line arrays": `users add` with only a multi-line `channels` (LF and CRLF) and `channels add` after a multi-line `deny_users` insert after the closing `]` (before the fix the line landed inside the array and the reload threw "unterminated array"); a quoted `]` / `#` survives and the first-line comment is kept; a rewrite the writer cannot quote is refused by the safety net and the file is unchanged. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | Existing /admin suite (30 tests) passes. The fixture no longer swallows loader errors: only the `{ not json` case opts in (`brokenAfterStart`), asserts the loader refuses that file, and models a file that broke after bridge start. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
- `specs/cli/context.md`
