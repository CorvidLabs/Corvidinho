---
module: plugins
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
---

# Delta — plugins (allowlist file: multi-line TOML arrays, fail closed)

## Modified

### REQUIREMENT REQ-plugins-006

Allowlists SHALL load from bot-VM config file (`CORVIDINHO_ALLOWLIST_FILE` or `~/.config/corvidinho/allowlist.toml|json`) with env overlays (ALLOW-4). Secrets stay in env.

The TOML file SHALL be read as a minimal subset: `[section]` headers and
`key = value`, where a value is an array of quoted strings or bare words that
MAY span lines, with a trailing comma and `#` comments between items, or a
one-line `"a,b"` / `a b` list. Any Unicode whitespace (a pasted U+00A0
included) SHALL separate tokens. Single-line allow/deny lists SHALL read as
before. In `[github]`, `[discord]` and the top level, any line or value
outside that subset (unterminated or malformed array or string, unsupported
key or escape) SHALL be a load error that names the line and key but no
values. So SHALL a header that names github or discord in a form the reader
does not support (`[[github]]`, `["discord"]`, `[github`), any other
malformed header (unbalanced brackets, a stray array line), and a `deny…`
key anywhere outside `[github]` / `[discord]`, where the loader would ignore
it. Other sections — `[owner]`, and loosely written headers such as
`[my notes]` or `[[rules]]` — SHALL stay lenient and SHALL NOT stop a load.
A file that exists but cannot be read or parsed (TOML or JSON) SHALL make
`loadAllowlist` throw instead of falling back to env overlays alone, so a
deny list in the file can never be dropped while an env allow admits the
target (fail closed; GITHUB-6, ALLOW-1..6). Action gates (`git-push`,
`discord-post-message`, the GitHub repo gate) SHALL turn that into a normal
refusal with exit 3 naming the file problem (path, line and key, never list
values), never a thrown error, and `corvidinho doctor` SHALL report it as a
failing `allowlist-file` check with the same error. A missing file SHALL
still mean env overlays only.

Acceptance Criteria
- File path env and default home config paths are consulted.
- Env overlays (e.g. `CORVIDINHO_GITHUB_ALLOW_REPOS`) merge over file.
- `orgs` / `repos` / `deny_repos` / `deny_orgs` arrays spanning lines (trailing comma, `#` comments) load every item; a multi-line file `deny_repos` refuses the repo at the gate and in `git-push` (exit 3) while an env allow admits its org.
- Single-line files parse to the same result as the previous reader (corpus includes `allowlist.example.toml`).
- An unterminated or malformed array or string, a bad key or a bad header in an allow/deny section throws; `loadAllowlist` rejects for a malformed TOML or JSON file.
- A pasted U+00A0 between tokens parses; `[my notes]`, `[[rules]]` and `['x']` sections do not stop a load; a `deny_*` key at the top level or in another section, `[[discord]]`, `["github"]`, a stray `["a", "b"]` line and unbalanced brackets throw.
- With a malformed file, `git-push` (nothing pushed) and `discord-post-message` refuse with exit 3 and the line/key error, without the list values; `corvidinho doctor` shows `[fail] allowlist-file` with the parse error, `[ok]` for a file that loads and `[info]` when there is none.

### REQUIREMENT REQ-plugins-253

The GITHUB-6 repo gate used by every GitHub plugin (plugins/github commands
and review reads) SHALL build its allowlist with the ALLOW-4 loader
(`loadAllowlist`: the allowlist file — `CORVIDINHO_ALLOWLIST_FILE` or
~/.config/corvidinho/allowlist.toml|json — plus env overlays), the same
loader WATCH ingress uses, and SHALL NOT fall back to env overlays alone.
`deny_repos` / `deny_orgs` from the file SHALL win over an allow list from env
(and over the community public-repo path), and an allow list only in the file
SHALL admit matching repos. A missing allowlist file SHALL contribute nothing
while env overlays still apply, so with no env allow list the gate refuses
(default-deny). A malformed or unreadable allowlist file SHALL make the gate
refuse every repo — even one an env allow list admits, since the file's deny
lists are unknown — with exit 3 and a GITHUB-6 error naming the file problem
(path, line and key, never list values), not a thrown error
(REQ-plugins-006). `checkRepoGateAsync` SHALL expose the same file + env gate
to other callers. The test suite SHALL NOT read the operator's allowlist file:
the bun test preload points `CORVIDINHO_ALLOWLIST_FILE` at a missing file,
and tests that hand a custom env object to a loader pass a missing file too.
No new env var, config key, slash command or plugin.

Acceptance Criteria
- With deny lists only in the file and the allow list only in env, github-issue-create, github-issue-comment, github-pr-create, github-pr-review and the review reads refuse the denied repo or org with exit 3 and a GITHUB-6 error; nothing is posted.
- With the allow list only in the file, allowed repos pass and unlisted repos are still refused.
- A non-admin role session is refused for a file-denied repo even when it is public.
- `corvidinho plugins run` with ~/.config/corvidinho/allowlist.toml honors its deny lists.
- With a malformed (truncated JSON, or a TOML deny list missing its `]`) or unreadable (a directory) allowlist file, the gate and github-issue-create refuse every repo with exit 3 and a `GITHUB-6: refused — allowlist file unreadable or malformed` error, with or without env `CORVIDINHO_GITHUB_ALLOW_ORGS`; the TOML error names the line and key, not the values.
- With an operator allowlist file admitting corvidlabs (via `CORVIDINHO_ALLOWLIST_FILE` or ~/.config/corvidinho/allowlist.toml), `bun test` has no failures and no test sends a request to api.github.com while a GitHub token is set.
