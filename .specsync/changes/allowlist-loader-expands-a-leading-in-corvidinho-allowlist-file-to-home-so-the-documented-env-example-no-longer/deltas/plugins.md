---
module: plugins
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
---

# Delta — plugins (a leading ~ in CORVIDINHO_ALLOWLIST_FILE is HOME)

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

A `CORVIDINHO_ALLOWLIST_FILE` value (trimmed) that is `~` or starts with `~/`
SHALL resolve against the HOME the loader uses for the default path, so the
documented `.env.example` value `~/.config/corvidinho/allowlist.toml` — which
dotenv loaders, Bun's included, keep literally — reads the same file as the
default path instead of a cwd-relative `~/…` that is never found (which
silently dropped the file's deny lists and `[owner]`). `~user` and every other
value SHALL be used as written. The allowlist loader, the owner loader, the
`/admin` write target and `corvidinho doctor` SHALL all resolve the file this
way. No new env var or config key.

Acceptance Criteria
- File path env and default home config paths are consulted.
- Env overlays (e.g. `CORVIDINHO_GITHUB_ALLOW_REPOS`) merge over file.
- `orgs` / `repos` / `deny_repos` / `deny_orgs` arrays spanning lines (trailing comma, `#` comments) load every item; a multi-line file `deny_repos` refuses the repo at the gate and in `git-push` (exit 3) while an env allow admits its org.
- Single-line files parse to the same result as the previous reader (corpus includes `allowlist.example.toml`).
- An unterminated or malformed array or string, a bad key or a bad header in an allow/deny section throws; `loadAllowlist` rejects for a malformed TOML or JSON file.
- A pasted U+00A0 between tokens parses; `[my notes]`, `[[rules]]` and `['x']` sections do not stop a load; a `deny_*` key at the top level or in another section, `[[discord]]`, `["github"]`, a stray `["a", "b"]` line and unbalanced brackets throw.
- With a malformed file, `git-push` (nothing pushed) and `discord-post-message` refuse with exit 3 and the line/key error, without the list values; `corvidinho doctor` shows `[fail] allowlist-file` with the parse error, `[ok]` for a file that loads and `[info]` when there is none.
- `CORVIDINHO_ALLOWLIST_FILE=~/.config/corvidinho/allowlist.toml` (the `.env.example` line, uncommented in a project `.env`) loads the file under HOME: its `deny_repos` refuses the repo at the GITHUB-6 gate while an env allow admits its org, and its `deny_users` / `[owner]` load; doctor and the `/admin` write target use the same path; a malformed file there fails closed and a missing one still means env overlays only.
- A bare `~` resolves to HOME; `~user`, absolute, relative and inner-`~` values are used as written.
