---
spec: plugins.spec.md
---

## User Stories

- As an operator, I want typed plugins with danger markings so GitHub reads and meta list go through reviewed commands, not improvised shell.

## Acceptance Criteria

(Populated by SpecSync change materialize from deltas.)

## Constraints

- Secrets stay out of repo.
- GitHub write/create plugins out of scope for this change.

## Out of Scope

- Discord, PR create/merge plugins, autonomous extras.

### REQ-plugins-001

The system SHALL expose a typed plugin registry with register/list/get where list returns name, description, dangerous, and minTier (PLUGIN-1/2/6).

Acceptance Criteria
- `list()` returns sorted entries with name, description, dangerous, minTier.
- Builtins register github-* and plugins-list commands.

### REQ-plugins-002

When a command is marked dangerous and non-interactive mode is on, the runtime SHALL deny execution unless the command name is allowlisted (SAFE-1 / CLI-3).

Acceptance Criteria
- `danger-ping` under `--non-interactive` without allowlist exits 2 with Denied/SAFE-1.
- Allowlisted `danger-ping` succeeds.

### REQ-plugins-003

Built-in read-only GitHub commands SHALL call GitHub via Octokit (`GITHUB_TOKEN`/`GH_TOKEN`), not shell `gh` (GITHUB-1/4).

Acceptance Criteria
- github-pr-list/status/ci-status/issue-list use `@octokit/rest`.
- No `Bun.spawn(["gh", ...])` in plugin bodies.

### REQ-plugins-004

GitHub plugins SHALL require `--repo OWNER/REPO` and enforce default-deny allowlists for orgs/repos (and user checks when supplied): empty allow ⇒ refuse; deny always wins; allow match required (GITHUB-6 / ALLOW-1,2,5). Never empty→allow-all.

Acceptance Criteria
- Missing `--repo` exits non-zero with GITHUB-6 message.
- Empty allowlist + any repo ⇒ deny (not authorized).
- Denied repo exits with code 3 and clear error.
- Allow-listed repo/org match ⇒ ok unless also denied.

### REQ-plugins-005

Allowlists SHALL default-deny: empty or missing allow entries refuse targeted GitHub plugin runs and Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny overrides always win. Empty lists MUST NOT map to allow-all or Merlin BASIC.

Acceptance Criteria
- Empty/missing allowlist refuses GH `--repo` targets (exit 3 / not authorized).
- Discord stub `checkChannel`/`checkRole`/`checkUser` refuse when allow lists empty.
- Regression: empty allow never permits a target (Merlin empty→BASIC forbidden).

### REQ-plugins-006

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

### REQ-plugins-007

The system SHALL expose a Discord allowlist stub API (channel/role/user) for future HEAR (#5) without implementing the full Discord bridge.

Acceptance Criteria
- Exported `checkChannel` / `checkRole` / `checkUser` (or equivalent) honor default-deny + deny override.
- No Discord gateway/bridge process in this change.


### REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

The tools SHALL stay inside the project: they read this repo's `specs/` and the companions next to a spec, using project files only (SPECSYNC-1 / SPECSYNC-5 / SPECSYNC-6), as typed plugin commands (PLUGIN-1). `specsync-read` and `specsync-brief` SHALL accept only a plain module name (letters, digits, `_` or `-`, the form `.specsync/registry.toml` names use; an optional `name=` prefix is stripped first) and SHALL refuse any other name before reading anything. Every file they read (the module spec, the legacy flat spec and each companion) SHALL resolve, with symlinks followed, inside the real path of the project's `specs/` dir, which SHALL itself resolve inside the real project root. `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` SHALL refuse a forwarded `--root` argument before spawning `specsync`.

Acceptance Criteria
- `plugins list` includes the SpecSync command names.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- `specsync-brief <module>` returns companion files when present.
- `specsync-read` / `specsync-brief` with a name that is not a plain module name — a relative traversal (`../../<outside>/outside`, `../../../..<abs>`), an absolute path, `.` / `..`, a path separator (`/` or `\`), a NUL byte or any other character — fail with exit 1 and a one-line `invalid spec module name` error (the name JSON-escaped, never a raw NUL) and read nothing.
- A module spec, legacy flat spec, module dir or companion that is a symlink resolving outside the project's `specs/` dir, or a `specs/` dir that resolves outside the project root, is refused with exit 1 and a `resolves outside` error naming only the in-project path; a refused companion fails the whole brief; no outside content is returned.
- Symlinks that stay inside `specs/` still read, and a missing module still reports `spec '<name>' not found`.
- `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` given `--root <dir>` or `--root=<dir>` fail with exit 1 (`refused: --root is not allowed; SpecSync tools run on this project only`) and `specsync` is not spawned.
- A tool-loop `specsync-read` call with a traversal name returns the refusal to the model, not the outside file.
- The Planning spec briefing (`loadRelevantSpecs`), which reads through the same helpers, leaves out a registered module whose spec or module dir resolves outside `specs/` and never includes a companion that does.

### REQ-plugins-009

The system SHALL register `discord-post-message` as a **dangerous** plugin (externally visible write). Non-interactive runs SHALL deny unless allowlisted (SAFE-1). Channel target MUST pass Discord channel allowlist (DISCORD-5 / ALLOW-3).

Acceptance Criteria
- `plugins list` shows `discord-post-message` with dangerous=true.
- Non-interactive without allowlist → deny (exit 2).
- Missing/empty channel allowlist or non-allowlisted channel → not authorized.

### REQ-plugins-048

The system SHALL register github-issue-create, github-issue-comment, github-pr-create, and github-pr-review as dangerous plugins with minTier 1.

Acceptance Criteria
- plugins list marks each write command dangerous=true minTier=1.

### REQ-plugins-049

In non-interactive mode the system SHALL deny write plugins unless CORVIDINHO_ALLOWLIST includes the command name (SAFE-1 / GITHUB-5).

Acceptance Criteria
- runPlugin without allowlist returns exit 2 and SAFE-1 wording.

### REQ-plugins-050

Every write SHALL pass the GITHUB-6 / ALLOW-1 repo gate before Octokit; empty allowlists SHALL refuse with exit 3.

Acceptance Criteria
- allowlisted command with empty repo allowlist fails exit 3.

### REQ-plugins-051

github-pr-create SHALL append plain Made with Corvidinho markdown attribution when missing and SHALL NOT insert @handles.

Acceptance Criteria
- dry-run body contains Made with Corvidinho link and no @Corvidinho.

### REQ-plugins-052

When CORVIDINHO_GITHUB_DRY_RUN=1 the write handlers SHALL return success without calling Octokit so CI needs no live tokens.

Acceptance Criteria
- dry-run tests pass without GITHUB_TOKEN.

### REQ-plugins-053

STATUS.md and docs/WATCH.md SHALL document the GitHub write plugins and assignee ingress dogfood path for issue #48.

Acceptance Criteria
- STATUS Done row and WATCH.md mention write plugins + assignment events.

### REQ-plugins-010

Corvidinho SHALL register memory plugins `memory-store`, `memory-recall`,
`memory-forget`, and `memory-override` (PLUGIN-1 memory surface) backed by
shared-store `MemoryStore` (REQ-discord-021).

`memory-store` / `memory-recall` are safe and act only in the acting user's
own scope. `memory-forget` / `memory-override` are dangerous (SAFE-1) and
SHALL require the two-phase confirm token plus ADMIN re-checked at handler
time (REQ-plugins-011, MEMORY-ACL-3/4). Acting Discord user id and ADMIN come
only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID`,
`CORVIDINHO_ACTING_IS_ADMIN`) checked against the live admin config — never
from argv.

Acceptance Criteria
- `plugins list` shows the four memory commands with danger markings.
- Store/recall work for the env acting user's scope without admin.
- Forget/override without a valid confirm token or without admin refuse.
- Non-admin cross-user forget refuses without leaking content.
- Builtins load memory plugins; fixture tests without live Discord.

### REQ-plugins-081

The system SHALL register typed file/search plugins `files-read`, `files-write`,
`files-edit`, `files-glob`, `files-list`, `files-delete`, and `search-grep`
(PLUGIN-1). Writes/edits/deletes SHALL declare `minTier: 2` (code).
`files-delete` SHALL be `dangerous: true` (PLUGIN-2).

Acceptance Criteria
- `plugins list` includes the seven command names with correct dangerous/minTier.
- `tests/plugins.list.smoke.test.ts` asserts files-read, files-write, search-grep.

### REQ-plugins-082

Every path argument SHALL resolve relative to the plugin cwd (task worktree /
project root). Absolute paths outside the root, `..` escapes, and symlink
resolutions that leave the root SHALL be refused. A dangling symlink (the leaf
or an ancestor, whose target does not exist yet) SHALL be followed by hand and
its target clamped the same way, so a write through it cannot land outside the
root and SAFE-2 (REQ-plugins-083) checks see the path the write would create;
a symlink loop SHALL be refused.

Acceptance Criteria
- Escape and symlink-outside-root fixtures refuse with a clear error.
- files-write through a dangling symlink to a missing file outside the root (absolute or relative link), or through a dangling directory link with a nested path, is refused and nothing is created outside the root.
- files-write through a dangling symlink to a missing SAFE-2 path (`.env`, `specs/*.spec.md`) is refused with SAFE-2 (exit 2) and the file is not created.
- A symlink loop is refused with a symlink error; a dangling symlink to a missing file inside the root still writes that in-root file.

### REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, and keystore-like basenames (`*keystore*`,
`wallet-keystore.json`).

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.

### REQ-plugins-084

Builtins SHALL load files + search plugins so the LLM tool loop can call them
at code tier. Happy-path and SAFE-2 deny fixture tests SHALL pass without live
tokens. STATUS.md ROADMAP and CHANGELOG SHALL record the slice.

Acceptance Criteria
- Happy read/write/edit/glob/grep tests pass; STATUS Done row cites #81.

### REQ-plugins-085

`memory-store` / `memory-recall` (and forget/override) plugin descriptions SHALL
include concrete argv examples so models under-using opaque argv arrays can call
them. OpenAI tool schemas for `memory-*` SHALL enrich the argv property
description similarly.

Acceptance Criteria
- Descriptions mention `--category` / `--key` / `--query` examples.
- `buildOpenAiTools` memory-* argv description cites examples.
- Fixture tests assert description richness.

### REQ-plugins-011

Memory plugins SHALL take the acting user and ADMIN status only from the
environment the Discord bridge sets per spawn, never from argv (argv is
model-controlled in the tool loop). `--user`, `--admin`, and `--db`
(including `--flag=value` forms) SHALL be refused. A missing
`CORVIDINHO_ACTING_DISCORD_USER_ID` SHALL refuse (MEMORY-ACL-1).

ADMIN for `memory-forget`, `memory-override`, and `memory-recall
--include-deleted` SHALL be re-checked inside the handler at call time
(ADMIN-4 / DISCORD-7). The bridge's per-dispatch
`CORVIDINHO_ACTING_IS_ADMIN=1` is required on every path (a scheduled run
spawned with it off never gets ADMIN), and the live config must agree: ADMIN
is owner-only (IDENTITY-2) — the acting user must be the configured owner;
no owner ⇒ nobody is ADMIN even when `CORVIDINHO_ACTING_IS_ADMIN=1`
(IDENTITY-3 / MEMORY-ACL-4); `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`
never grant ADMIN; deny-listed or muted users are never ADMIN. Self-forget
stays ADMIN-only.
Refusals stay opaque and never include memory content (MEMORY-ACL-2).

Forget and override SHALL be two-phase (SAFE-4). Phase 1 (no `--confirm`)
returns a confirm token, expiry, and target id/category/key/owner — no
content. Phase 2 (`--confirm <token>`) SHALL succeed only when the token's
HMAC matches op + actor + memory id + the row's `updated_at` (+ override
content hash), it is unexpired (10 minutes), and it is confirmed from a
different process/turn than the one that issued it, and the token appears in
the human's own message for this run (bridge-extracted into
`CORVIDINHO_ACTING_CONFIRM_TOKENS`) so the model cannot confirm from its own
memory. Tokens are single-use
because the row changes. The HMAC secret lives in `schema_meta` (no schema
version bump).

Acceptance Criteria
- `--user` / `--admin` / `--db` refused on all memory commands.
- No acting user env ⇒ refused; other actors never see a user's memories.
- No owner + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused.
- Owner id without the bridge bit (scheduled runs) refused; deny-listed or muted owner refused; admin user/role lists + env bit refused.
- Phase 1 returns a token without content; same-turn confirm refused; a token the human did not supply refused; new-turn human-supplied confirm succeeds; replay refused.
- Token for another memory, another actor, or changed override content refused; expired token refused.
- `--include-deleted` refused for non-admins; `--include-deleted=false` is off.
- `--user` / `--admin` / `--db` are only refused in flag position; text after `--` or in `--content=` is data.

### REQ-plugins-095

Every run of a plugin command marked dangerous SHALL leave a tamper-evident
audit trail (SAFE-5): `runPlugin` SHALL append a `started` row to the shared
append-only `audit_log` before the handler runs and SHALL refuse the run if
that row cannot be written (fail closed), then append an `ok` or `error` row.
A dangerous run denied in non-interactive mode SHALL be logged as `denied`
(best effort). Rows SHALL hold the action, actor, surface, a SHA-256 digest of
the argv, the outcome and exit code — never raw args or memory content.

The chain SHALL be HMAC-SHA256 keyed by `CORVIDINHO_AUDIT_HMAC_KEY` from the
bot-VM environment (never stored in the DB); without a key it is a SHA-256
integrity chain reported as unkeyed. `verifyAudit` SHALL recompute the chain
and report the first tampered row; keyed rows are unverifiable without the key.
Once the chain holds a keyed row it SHALL stay keyed: `appendAudit` without a
key SHALL refuse to append after a keyed row, and `verifyAudit` SHALL report
an unkeyed row that follows a keyed row as the first tampered row, so a keyed
row cannot be rewritten and relinked as a plain SHA-256 link while a keyed row
before it stays. An unkeyed prefix followed by keyed rows (key set later)
SHALL still verify. Rewriting every keyed row, from the first keyed row on, as
unkeyed links, or dropping the newest rows, is not detectable from the DB
alone; catching it needs an anchor kept outside the DB.

Acceptance Criteria
- Allowed dangerous run appends started + ok rows; raw args are not stored.
- Non-interactive denial appends a denied row; safe plugins append nothing.
- A dangerous run is refused when its started row cannot be written.
- Tampering is detected at the first bad row; wrong/missing key fails verify.
- A keyed row that follows a keyed row, edited and relinked with the rows after it as unkeyed SHA-256 links, fails verify with the key at that row (`chain BROKEN at #N`).
- Without the key, appending after a keyed row is refused, so a keyless dangerous run fails closed and the chain stays keyed; an unkeyed prefix followed by keyed rows still verifies (`mixed keyed/unkeyed`).

### REQ-plugins-042

The memory plugins' handler-time ADMIN re-check (REQ-plugins-011) SHALL treat
only the configured owner (IDENTITY-1/2; matched by Discord snowflake from the
owner env or the allowlist `[owner]` section) as ADMIN, under the same
conditions as the bridge: the per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` bit
is still required, and a muted or deny-listed owner is not ADMIN. With no
owner nobody is ADMIN; the admin user/role lists are ignored.

Acceptance Criteria
- Owner + bridge bit may run memory forget phase 1.
- Owner without the bit, a non-owner id, a muted owner, and an admin-list user or role holder are refused.

### REQ-plugins-182

The system SHALL register typed git plugins (PLUGIN-1) from `plugins/git/`
via builtins. Reads `git-status` (porcelain v1 `-z --branch
--untracked-files=all` parsed to JSON: branch, upstream, ahead/behind,
per-entry index/worktree codes, staged / unstaged / untracked / conflicted
lists; untracked files in a new directory are listed individually so they can
be passed to `git-commit`), `git-diff` (worktree, or index with
`--staged`; byte-capped with a `truncated` flag), `git-log` (last N commits,
oneline; default 10, max 100) and `git-branch-list` SHALL declare
`dangerous: false`, `minTier: 0`. Mutators `git-branch-create`, `git-commit`
and `git-push` SHALL declare `dangerous: true`, `minTier: 2` (code) so SAFE-1
denies them non-interactively unless allowlisted (PLUGIN-2).

Every git invocation SHALL use `Bun.spawn` with an argv array (no shell),
stdin closed, `GIT_TERMINAL_PROMPT=0`, repo-locating env (`GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, …) stripped, hooks disabled, and cwd
clamped to the plugin cwd: `GIT_CEILING_DIRECTORIES` stops discovery above
it and the cwd SHALL be the repository / worktree top level (SAFE-3). Unknown
flags SHALL be refused; path args SHALL resolve inside the plugin cwd with the
files-plugin clamp (escapes and symlink escapes refused) and be passed after
`--` as literal pathspecs.

`git-commit` SHALL require a message and stage explicit file paths only
(no directories, no `--all`, no `--amend`), SHALL refuse staging the deletion
of SAFE-2 protected paths (`isProtectedPath`) and any `.env*`, keystore or
`.git` path, SHALL commit only the named paths, and SHALL report the
committed paths as `filesChanged`. `git-branch-create` SHALL validate the name
and never reset an existing branch; when it switches it SHALL NOT overwrite
ignored local files such as `.env*` or keystores (`--no-overwrite-ignore`;
SAFE-2) and SHALL refuse (exit 2) instead, leaving HEAD and the files
unchanged. `git-push` SHALL push only the current
branch to the same-named ref on a configured remote (default `origin`), SHALL
never force (force / force-with-lease / delete / mirror / tags / `+` or `:`
refspec args refused), SHALL require every push URL's OWNER/REPO to pass
`checkRepoGate` (GITHUB-6; allowlist file + env, deny wins), SHALL take
credentials only from env / the credential helper, and SHALL redact URL
credentials and secret-looking tokens from its output.

Acceptance Criteria
- `plugins list` includes git-status, git-diff, git-log, git-branch-list (dangerous=false, minTier 0) and git-branch-create, git-commit, git-push (dangerous=true, minTier 2).
- Mutators are denied non-interactively without an allowlist entry (exit 2).
- git-status JSON reports branch, staged, unstaged and untracked entries from a temp repo, listing each new file in a new directory (which git-commit then accepts); git-diff worktree vs --staged differ and a small --max-bytes truncates.
- git-log returns N oneline commits; git-branch-list marks the current branch; git-branch-create creates and switches, refusing an existing name and option-like names; `--from` a start point that tracks an ignored local .env / keystore is refused (exit 2) and the local files and HEAD are unchanged.
- git-commit without a message or with only a directory is refused; it commits only named paths, reports filesChanged, refuses path escapes, .env, and staging a deleted protected path.
- A plugin cwd that is a subdirectory of a repository (not the top level) is refused; unknown flags are refused.
- Hooks in `.git/hooks` or a repo-local `core.hooksPath` never run on git-commit / git-push; git-status and git-commit work at the top level of a linked worktree (`.git` is a file).
- git-push to a local bare remote is refused when OWNER/REPO is not allowlisted or is denied (exit 3) and succeeds when allowlisted; force/refspec args are refused (exit 2); a non-fast-forward push is rejected without force and the remote ref is unchanged; detached HEAD is refused.

### REQ-plugins-086

The system SHALL register typed plugin `shell-exec` (PLUGIN-1). It SHALL declare
`dangerous: true` and `minTier: 2` (code) (PLUGIN-2). Non-interactive runs
without `shell-exec` on the allowlist SHALL deny (SAFE-1).

Acceptance Criteria
- `plugins list` includes `shell-exec` with dangerous=true and minTier=2.
- Non-interactive without allowlist returns exit 2 / SAFE-1.

### REQ-plugins-087

`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed. The clamp
SHALL be fail-closed: any command it cannot resolve to an in-root target
refuses.

The clamp SHALL tokenize the way the shell reads a command. Quotes and
backslash escapes SHALL join text into one word — a quoted or escaped space
never splits a target, so `cd "sub dir"` is checked as `sub dir` — and SHALL be
removed from a word before it is checked. A separator (`;`, `&`, `|`, newline,
`(`, `)`) inside single or double quotes or escaped with `\` is not a
separator. A backslash-newline outside single quotes SHALL be a line
continuation, and an escaped backslash before a newline SHALL NOT be one. `#`
at the start of a word SHALL start a comment that runs to the end of the line.
The end of a `$(…)` SHALL be found by these same rules. dash reads the lines
after `<<` / `<<-` as a here-doc body — data up to the exact delimiter line
(the delimiter word itself is not expanded, so a `$(` or backtick in it is
literal), apart from the `$(…)` and backtick substitutions of an unquoted
body — while
bash may read them as commands (`(( x << 2 ))` is arithmetic there), so a
command containing `<<` SHALL be checked under both readings and SHALL refuse
if either refuses, and so SHALL the re-parsed argument of `eval`; a quote
inside a here-doc body therefore cannot hide the commands after it. bash reads
`$'…'` as ANSI-C quoting, where `\` escapes even a `'`, while dash reads a `$`
then a single-quoted string, so a command containing `$'` SHALL also be
checked as bash reads it; a `$'…'` word holding a backslash escape counts as
an expansion. A `cd` or
`pushd` command that the text leaves open — an unterminated quote or a
trailing backslash — SHALL refuse, and so SHALL a command nested too deeply
to check. It SHALL find
a `cd` or `pushd` behind prefix words (`{`, `}`, `!`, `if`, `then`, `else`,
`elif`, `do`, `while`, `until`, `time`, `builtin`, `command`, `function NAME`)
and `NAME=value` / `NAME+=value` assignments. It SHALL drop redirections
(`>`, `>>`, `>&`, `>|`, `<`, `<>`, `<&`, `&>`, an `fd` prefix such as `2>&1`)
together with their targets wherever they appear in the command, SHALL NOT
treat the `&` of a redirection as a command separator, and SHALL skip
`cd` / `pushd` options (`-P`, `-L`, `-e`, `-@`, `-n`, `--`) to reach the real
target.

It SHALL refuse `-` (OLDPWD); a target containing `$`, a backtick, a glob or a
brace; a command word that the shell would expand (a command word containing
`$`, `$(…)` or a backtick); an `eval` whose argument would expand; and a write
to `DIRSTACK`. It SHALL re-parse the literal argument of `eval` as a command,
and likewise the action of `trap` and the `-c` string of a shell (`sh`,
`bash`, `dash`, `zsh`, `ksh`, `mksh`, `ash`, `yash`, `posh`, named by name or
path anywhere in a simple command, so also behind `env`, `exec`, `nohup`,
`timeout`, `xargs` or `find -exec`; `-` ends the shell's options like `--`, and
each `o` / `O` in an option cluster such as `-co pipefail` takes the next
word), refusing a `trap` action or `-c` string that would expand; it SHALL
refuse an alias definition (`alias NAME=…`); and it SHALL analyse the body of each command substitution (`$(…)` and backticks)
as a command, refusing an escaping `cd`/`pushd` found inside. The spawned shell
SHALL run `CDPATH=; readonly CDPATH` before the command and SHALL NOT inherit
`CDPATH` or `OLDPWD` from the bot's environment, so a `CDPATH` set anywhere in
the command (including one built dynamically) cannot redirect a relative `cd`
outside the root; `CDPATH` is therefore NOT refused lexically.

The clamp SHALL also check, before spawn, each script the command runs in a
shell, looking for it from the root and from every in-root `cd` target before
it: a file sourced with `.` / `source` or named by `BASH_ENV=` or a shell's
`--rcfile` / `--init-file`; a file a shell runs as its script operand or reads
as standard input through `<` / `<>`; a here-doc or here-string a shell reads
(an unquoted here-doc body as the shell expands it: `\$`, `` \` ``, `\\` and
`\`-newline lose the backslash); and a file run by path — a command word
holding `/`, also behind the exec wrappers above and `find -exec` — whose `#!`
line names a shell (directly or through `env` / `busybox`) or that has no `#!`
line and is text. Each script's text SHALL be checked like a command, scripts
it runs included, and a refusal inside it SHALL name the script
(`TARGET (in SCRIPT)`). It SHALL refuse a script path that would expand; a
sourced or shell-run script that does not exist; more than 1 MiB of script
text, more than 32 scripts, or more than 32 directories to look in; a script
that the command or one of its scripts writes, in any order — an output
redirection (`>`, `>>`, `<>`, …) target or an argument of a command that is not
read-only; a here-doc or here-string a shell reads that would expand; and a
shell reading its commands from anything else (a pipe, the standard input it
inherits, a process substitution). A file run by path that does not exist (a
program the command builds first) or is not a shell script (a binary, a `#!`
naming another interpreter) SHALL NOT be read.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.
- Redirection-hidden targets refuse: `>/dev/null cd /etc`, `cd >/dev/null /etc`, `cd</dev/null /etc`, `cd 2>&1 /etc`, `cd -P >/dev/null /etc`; an in-root `cd sub >/dev/null` and `cd 2>&1 sub` stay allowed.
- Quote-aware forms refuse: `X="a b" cd /etc`, `X=';' cd /etc`, `cd "x /../.."`, `cd 'sub dir/../..'`; a backslash-newline `cd` (`c\`+newline+`d /etc`, `cd sub/\`+newline+`../..`) refuses; `cd "sub dir"` and `X=';' cd sub` stay allowed.
- Quoting is read as the shell reads it: `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..`, `cd 'a b'/../..` and `cd sub/..\`+newline+`/..` refuse; so does a `cd /etc` after an escaped backslash and a newline (`echo a\\`+newline), after a `#` comment holding a quote, after a here-doc body holding a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`), or after a `$(…)` whose comment or here-doc holds a `)`; an escaping `cd` in a `$(…)` or backtick of an unquoted here-doc body refuses, also when the delimiter holds a backtick (`cat <<`+backtick+`x`+newline+`#' $(cd ..)`); `(( x = 1 << 2 ))`+newline+`cd /etc` refuses, also inside `eval` when quote removal forms the `<<`; `cd "sub`, `cd 'sub` and `cd sub\` refuse; `$(`-nesting too deep to check refuses instead of throwing; `cd sub # comment`, `cd sub \`+newline+`&& ls`, and an in-root `cd sub` after a here-doc whose body holds a stray quote or apostrophe stay allowed; `eval "cd /; ls"` refuses `/`. End to end each refused form returns exit 2 with SAFE-3 and nothing is spawned.
- bash `$'…'` is read as bash reads it: `echo $'\''; cd /etc #'` refuses, and so do `cd $'\x2e\x2e'` and `$'\x63d' /etc`. A shell's `-c` string is checked like an `eval` argument: `sh -c 'cd /etc'`, `/bin/sh -ec 'cd /etc'`, `bash --norc -o pipefail -c 'cd ..'`, `env X=1 sh -c 'cd /etc'`, `timeout 5 sh -c 'cd /etc'`, `xargs sh -c 'cd /etc'`, `find . -exec sh -c 'cd /etc' \;` and `sh -c "cd $X"` refuse; `sh -c 'cd sub && ls'`, `bash -lc 'echo hi'` and `bash scripts/build.sh` (an in-root script) stay allowed.
- Expansion forms refuse: `$(echo cd) /etc`, `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)`; `echo $(cd sub && ls)` and `eval 'cd sub'` stay allowed.
- Bash `X+=1 cd /etc` refuses; a `DIRSTACK[...]=` write refuses.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`; a command that sets `CDPATH` to an outside dir and then runs a relative `cd sub` does not print the outside path.
- Scripts a command runs in a shell are checked, with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, a `#!`-less text file or `#!/usr/bin/env -S bash -e` script run by path, `env X=1 ./bad.sh`, `timeout 5 ./bad.sh`, `exec ./bad.sh`, `find . -exec ./bad.sh \;`, `BASH_ENV=./bad.sh bash -c true`, `bash --rcfile bad.sh -i ok.sh`, `sh < bad.sh`, `sh -s arg < bad.sh`, a nested `. ./nested.sh` and `cd sub && . ./inner.sh` (`cd ../..`) refuse, naming the script (`/etc (in ./bad.sh)`); so do `sh <<'EOF'`+newline+`cd /etc`+newline+`EOF`, an unquoted here-doc whose body expands to `cd /etc` (`c\\d /etc`), `bash <<< 'cd /etc'`, shell input that would expand (`sh <<EOF` with a `$`, `bash <<< "$X"`), `cat bad.sh | sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)`, `. <(cat bad.sh)`, `sh missing.sh`, `sh "$S"`, `. ~/x.sh`, `sh *.sh`, a script over 1 MiB, and a script the command writes (`echo … > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done`). `trap 'cd /etc' EXIT`, `trap "$X" EXIT`, `alias c=cd`, `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` refuse. `sh ok.sh`, `./ok.sh && ./okcd.sh` (`cd sub`), `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `sh <<'EOF'`+newline+`cd sub && pwd`+newline+`EOF`, `bash <<< 'echo hi'`, a binary or `#!/usr/bin/env python3` file run by path, a program the command builds first, and `trap 'rm -f tmp.txt' EXIT` stay allowed. End to end each refused form returns exit 2 with SAFE-3 and nothing is spawned; in-root scripts run.

### REQ-plugins-088

Builtins SHALL load shell plugins. Happy-path + SAFE-3 refuse + SAFE-1 deny
fixture tests SHALL pass without live tokens. Package version SHALL be `0.0.9`.
STATUS.md ROADMAP and CHANGELOG SHALL record the slice. A WATCH reliability
HI draft MAY live under `docs/hi-drafts/` only (not `hi/`).

Acceptance Criteria
- `package.json` version is `0.0.9`; CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section; STATUS marks #83 done.
- `docs/hi-drafts/WATCH-RELIABILITY.md` exists as draft.

### REQ-plugins-117

The system SHALL register autonomous extras as plugins (PLUGIN-5) from
`plugins/autonomous/` via builtins. `PluginCommand` SHALL accept
`autonomous?: boolean` (left out of the agent tool catalog unless the session
is allowed, REQ-agent-117 / SAFE-9). `PluginHandlerArgs` and `runPlugin`
options SHALL accept optional `tier` and `signal`, passed through to the
handler unchanged when given.

The `delegate` command SHALL declare `dangerous: false`, `mutating: true`,
`minTier: 2` and `autonomous: true` (PLUGIN-2). Being mutating (ROLES-CHAT-5:
a worker runs tools), a non-ADMIN role session SHALL never see it in the tool
catalog and `runPlugin` SHALL refuse it with exit 2 "not allowed for your role"
before the handler runs, spawning nothing (ROLES-CHAT-2/3/6). Its handler
SHALL, in order: parse
`[--skill NAME] [--tier read|tool|code] --task TEXT` (or positional text; the
skill is a short lowercase `[a-z0-9_-]` label; `--task` takes the next item
even when it starts with `-`) and exit 1 on a usage error; refuse with exit 2
and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the delegation depth cap is reached, when the lead's tier
(the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is below
code, or when the concurrency / per-run budget is spent; otherwise run one
worker (REQ-agent-117) in the plugin cwd with the lead's allowlist and abort
signal. The result data SHALL carry `skill`, `tier`, `tierClamped`, `depth`,
`exitCode`, `state`, `summary`, `filesChanged` and, when present,
`verified`, `verifySkipped`, `totalTokens`, `timedOut`, `aborted`, so the lead can synthesize the result
(AUTONOMOUS-5). The result SHALL be ok only when the worker exits 0 in state
`done`.

Acceptance Criteria
- `delegate` is registered with dangerous=false, mutating=true, minTier=2, autonomous=true.
- A non-ADMIN role session's `runPlugin delegate` is refused with exit 2 "not allowed for your role" and spawns nothing.
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent budget are refused with exit 2 and spawn nothing; bad args exit 1.
- Happy path against a fake bin: argv has `task run`, `--non-interactive`, no `--no-verify`, the clamped `--tier`, and `--task` last with the skill / depth provenance header; env has depth 1, the worker tier, non-interactive, the lead allowlist, ADMIN 0 for a role-session lead and no confirm tokens; data carries skill / tier / depth / state / filesChanged / verified / verifySkipped.
- A failed worker yields ok=false with its exit code and a SAFE-6 scrubbed summary.

### REQ-plugins-111

The plugin host SHALL provide a typed `web-fetch` builtin (PLUGIN-1) declared
`dangerous: true` and `minTier: 1` (PLUGIN-2) that performs one HTTP GET and
returns text. Being dangerous it SHALL need SAFE-1 consent: it is left out of
the default tool catalog, denied in non-interactive runs unless allowlisted,
and audited (SAFE-5). It SHALL accept only `http` and `https` URLs without
embedded credentials, and SHALL refuse, before DNS, any URL (first hop or
redirect target) that carries a value `scrubSecrets` would redact, raw or
percent-decoded. Before any connection it SHALL check every address the fetch
would use (the IP literal, or every DNS answer) and SHALL refuse (SAFE-7)
loopback, private (RFC 1918), CGNAT (100.64.0.0/10), link-local
(169.254.0.0/16 including 169.254.169.254, fe80::/10), unique-local
(fc00::/7), multicast, unspecified, 0.0.0.0/8, reserved/documentation space
and IPv4-mapped, IPv4-compatible and NAT64 forms of those; one non-public
answer SHALL refuse the name. The connection SHALL dial only checked IPs, in
answer order, moving to the next checked address only after a socket-level
connect failure and within the same deadline, while the Host header and TLS
SNI keep the original name and the certificate is verified against it, so DNS
rebinding cannot swap the target. Redirects SHALL be followed manually (at most
5) with the full check on every hop. The body SHALL be capped at 1 MiB, the
returned text at 100,000 characters (truncated and flagged) and the whole call
at 15 seconds. Non-text content types, a Content-Type that is not an RFC 6838
`type/subtype` token, and compressed bodies SHALL be refused. Returned text
SHALL have C0/C1 control characters removed (newline and tab kept), SHALL be
secret-scrubbed (SAFE-6 `scrubSecrets`) and SHALL be fenced as untrusted data
with a per-call random marker id; the page title SHALL appear only inside the
fence. Errors SHALL NOT echo server-chosen text (reason phrase or header
values) and SHALL be single-line, control-free and length-capped.

Acceptance Criteria
- `plugins list` shows `web-fetch` with dangerous=true, minTier=1; the default tool catalog leaves it out, it is offered at tool/code tier only when dangerous tools are included and never at read tier; a non-interactive run that has not allowlisted it is denied (SAFE-1); no `web-search` command exists.
- Each blocked range, as an IP literal, a DNS answer or a redirect target, is refused with exit 2 before the transport is called.
- A URL or redirect Location carrying a vendor-key-shaped value is refused with exit 2 before DNS and before the transport is called.
- A name that resolves public then private (rebinding) is dialed only at the checked public IP; the private answer on a later hop is refused.
- When a checked address fails to connect, the next checked address is tried; an unchecked address is never dialed.
- Non-http schemes, URL credentials and more than 5 redirects are refused.
- A body over 1 MiB or text over 100,000 characters is truncated and flagged; a stalled transport, body or resolver times out.
- Non-text or malformed content types are refused before the body is read.
- Output is fenced as untrusted data, control characters are stripped and vendor-key-looking secrets are redacted; a hostile title, Content-Type or status text never appears outside the fence.
- HTML-to-text tag stripping repeats to a capped fixpoint, so split or nested tags never reassemble into markup and deeply nested hostile markup stays linear.

### REQ-plugins-118

The `council` command SHALL be registered from `plugins/autonomous/` with
`dangerous: false`, `mutating: true` (a council runs workers, ROLES-CHAT-5),
`minTier: 2` and `autonomous: true`. It is therefore hidden from the tool
catalog unless the session is allowed (REQ-agent-117 / SAFE-9), and it is
never offered to or run for a non-ADMIN role session (ROLES-CHAT-2/3/6). Its
handler SHALL, in order: parse `[--voices N] [--tier read|tool] --question
TEXT` (or positional text; `--question` takes the next item even when it
starts with `-`; N is clamped to 2..5, default 3; the question is at most
4000 chars) and exit 1 on a usage error or an unknown tier; refuse with exit
2 and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the run is not a top-level lead (a delegation depth
other than 0: a delegated worker never convenes a council, so no voice can
outlive a worker its lead stops, SAFE-9), when the lead's
tier (the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is
below code, or when the council budget is spent (one council at a time, at
most 2 per lead process); otherwise run a council (REQ-agent-118) in the
plugin cwd with the lead's abort signal. Every voice SHALL get an empty
allowlist and a non-ADMIN role env, whatever the lead's allowlist or role.
The result data SHALL carry `voices` (plus `voicesRequested` when clamped),
`tier`, `tierClamped`, `depth`, `state`, `decision`, `phases`, `transcript`
(the chair's text replaced by a pointer to `decision`), `filesChanged`,
`elapsedMs` and, when present, `totalTokens`, `timedOut` and `aborted`. The
result SHALL be ok (exit 0) only when the chair decided; otherwise it SHALL
be ok=false with exit 130 when cancelled and exit 1 when failed.

Acceptance Criteria
- `council` is registered with dangerous=false, mutating=true, minTier=2 and autonomous=true, and is listed in `plugins list`.
- The default catalog omits `council` at every tier. An allowed code-tier CLI / ADMIN session gets it; tool tier and non-ADMIN sessions do not.
- Autonomous off, depth 1 (a delegated worker), depth 2, tool tier, an omitted tier with the default env tier, and a spent council budget are refused with exit 2 and spawn nothing. The depth 1 refusal names the top-level-lead rule and spends no council budget. A missing question and an unknown tier exit 1.
- Against a fake bin, 3 voices make 7 worker runs. Each is `task run --non-interactive --tier read --output ndjson` with `--task` last and no `--no-verify`. Each env has depth 1, tier read, non-interactive, an empty `CORVIDINHO_ALLOWLIST` (even when the lead allowlists dangerous tools), `CORVIDINHO_ACTING_IS_ADMIN=0`, and no GitHub / Discord token or audit key. The data carries the decision and a 7-entry transcript.
- `--tier code` is clamped to tool. A failed chair gives ok=false, exit 1, with the transcript. The council time cap gives exit 130 and state cancelled. The limiter allows one council at a time and 2 per run. A non-ADMIN role session's `runPlugin council` is refused with "not allowed for your role" and spawns nothing.

### REQ-plugins-093

The system SHALL register read-only typed plugins `github-pr-diff` and
`github-pr-files` (GITHUB-3 read half, GITHUB-1) that call GitHub through
Octokit, never shell `gh`. Both SHALL declare `dangerous: false` and
`minTier: 0` and SHALL apply the same `--repo OWNER/REPO` GITHUB-6 repo gate as
the other github-* commands before any API call (default-deny, deny wins,
exit 3).

`github-pr-diff <number> --repo OWNER/REPO [--file PATH]` SHALL return the PR's
unified diff, capped at 200 KiB of UTF-8 cut on a line boundary, with a clear
`[corvidinho: diff truncated …]` marker when capped. `--file PATH` SHALL return
only that file's diff section (matching the new or previous path) and SHALL
fail with a clear error when the file is not in the PR. The `--file` value
SHALL be trimmed and stripped of leading `./`; a `--file` that is empty after
that (for example `./` or whitespace) SHALL be a usage error (exit 1, no API
call), never a fallback to the whole-PR diff. A file section rebuilt from
`pulls.listFiles` SHALL carry `rename from`/`rename to` lines for a renamed
file and `copy from`/`copy to` lines for a copied file. When GitHub returns no
patch and reports no changed lines for a renamed, copied, or mode/type-changed
(`changed`) file, the section SHALL say the content is unchanged (a pure
rename, copy, or mode change; for rename/copy, unless the file is binary) and
SHALL NOT describe it as a binary file or a diff that is too large.

`github-pr-files <number> --repo OWNER/REPO [--limit N]` SHALL list changed
files with status, additions and deletions (and the previous name for
renames), paginated up to `--limit` (default 300, max 3000) with a `truncated`
flag when more files exist.

Returned diff text and file names SHALL be passed through `scrubSecrets`
(SAFE-6) before capping, and payloads SHALL label the content as untrusted PR
data, not instructions. Because the diff is written by whoever opened the PR,
the scrub's work SHALL be bounded: diff text SHALL first be cut to a hard
limit of 800 KiB (4 × the cap) on a line boundary, dropping a private-key
block left without its END line, and the scrub patterns SHALL run in time
linear in their input. `totalBytes` SHALL report the uncut size.

Acceptance Criteria
- `plugins list` shows `github-pr-diff` and `github-pr-files` with dangerous=false and minTier=0.
- Empty or deny-listed repo refuses with exit 3 before any Octokit call.
- A diff over 200 KiB returns at most 200 KiB plus the truncation marker; `--file` returns one file's section.
- `--file ./`, `--file "   "`, `--file=./` and `--file " ././ "` each fail with a usage error and make no API call.
- A pure rename, pure copy, or `changed` (mode) entry with no patch and 0 lines says content unchanged, not binary or too large; a copied file's section has `copy from`/`copy to` lines; entries with line changes but no patch keep the binary/too-large note.
- `github-pr-files` pages `pulls.listFiles`, honours `--limit`, and sets `truncated`.
- Vendor-token-looking strings in diff text are redacted, including one straddling the cap.
- A hostile diff far over the cap (many private-key openers, no closer) returns quickly; a private key split by the hard cut is not returned.
- Tests mock Octokit (no network, no token).

### REQ-plugins-112

The system SHALL discover the Fledge plugins registered for a project through
the local fledge CLI (FLEDGE-4 / PLUGIN-3): it SHALL run
`fledge --non-interactive plugins list --json` (required) and
`fledge --non-interactive plugins audit --json` (capabilities, best effort) as
argv arrays with cwd set to the project root, stdin closed, a timeout and a
capped output size, never through a shell. Fledge output SHALL be treated as
data: command names SHALL match `^[A-Za-z0-9][A-Za-z0-9_-]{0,56}$` or be
skipped with a warning, and free text SHALL be cleaned of control characters
and length-capped. Each valid Fledge command SHALL register as the typed
plugin `fledge-<command>` with `dangerous: true` (fledge manifests declare no
danger or tier and native plugins run unsandboxed, so SAFE-1 consent applies)
and `minTier` 2 (code) for native or capability-unknown plugins, or 1 (tool)
for a wasm-sandboxed plugin without the `exec` capability (PLUGIN-2). The
command description SHALL stay small and SHALL NOT include the plugin source
path (FLEDGE-5). A name already registered by a builtin or another plugin
SHALL be skipped with a reason. A missing fledge binary, non-zero exit,
unexpected JSON, oversized output or timeout SHALL degrade to zero Fledge
commands with a reason and SHALL NOT affect builtins.

Each registered Fledge command SHALL be bound to the project root (resolved
cwd) it was discovered for. Loading another root SHALL rebind same-named
Fledge commands to that root's plugin (origin, tier and danger from it) and
SHALL remove Fledge commands that root does not offer, including when its
discovery fails; a cached load SHALL be reused only while every Fledge
command in the registry is still bound to that root; a forced reload SHALL
pick up a changed plugin version. A bound command called with any other cwd
SHALL be refused with exit 2 without starting fledge, so a long-running
process never runs one project's plugin under another project's name.

Acceptance Criteria
- Fake fledge fixture: list + audit rows register `fledge-hello`, `fledge-bye`, `fledge-tz`, `fledge-runner`, all dangerous; native → minTier 2, wasm without exec → 1, wasm with exec → 2, audit unavailable → 2.
- Invalid or overlong command names are skipped with a warning; duplicate names across plugins are skipped with a reason.
- Missing fledge, exit 3, bad JSON and a 200 ms timeout each return ok=false with a reason and leave the builtin list unchanged.
- The description names the plugin, version, trust tier and sandbox and never the source path.
- Two roots with different plugins behind `fledge-hello`: after loading the second, origin and minTier come from its plugin, the first root's other commands are gone, a call from the first root's cwd is refused with exit 2 and runs nothing, and loading the first root again rebinds it.
- A root whose discovery fails leaves no other root's Fledge command registered; builtins stay.

### REQ-plugins-113

Running `fledge-<command>` SHALL execute
`fledge --non-interactive plugins run <command> -- <argv...>` as an argv array
(no shell interpolation) with cwd pinned to the bound project root, stdin
closed, and a child env that drops `CORVIDINHO_*`,
`DISCORD_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`,
keeps the rest (including GitHub tokens for GitHub-backed Fledge plugins), and
sets `FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`. The `--` SHALL
end fledge's own options so model-supplied argv such as `--help`, `--json`
or `--ni` reach the plugin verbatim (fledge 1.8 passes everything after one
`--` to the plugin). Output SHALL be
secret-scrubbed with `scrubSecrets` (SAFE-6) and capped per stream; a run
SHALL time out (default 120 s) and be killed with exit 124; the calling run's
abort signal (AGENT-3) SHALL stop it with exit 130 (`aborted`), and an
already-aborted call SHALL not start fledge. Fledge SHALL run in its own
process group and a timeout or abort SHALL stop its whole process tree
(REQ-plugins-154), including a grandchild left holding the output pipes after
the plugin exited. A non-zero exit
SHALL be a failed result carrying that exit code; a binary that cannot start
SHALL fail with exit 127 instead of throwing. SAFE-1 SHALL deny the command in
non-interactive mode unless `fledge-<command>` is allowlisted, and SAFE-5
audit rows SHALL be recorded as for any dangerous plugin.

Acceptance Criteria
- Non-interactive without allowlist → exit 2 with SAFE-1; allowlisted → argv is `plugins run hello -- <argv...>` and the fake plugin sees each argv item verbatim (spaces, `$(…)`, `;` not interpreted), cwd = project root.
- `--help`, `--json`, `--ni` and a literal `--` as argv reach the plugin in order, and fledge's own help is never printed.
- The child env lacks Discord / Corvidinho LLM / audit keys, keeps `GITHUB_TOKEN`, and has `FLEDGE_NON_INTERACTIVE=1`.
- Exit 7 → ok=false exitCode 7; sleep past a 200 ms timeout → exitCode 124; missing binary → 127.
- A timeout kills a same-group and a `setsid` grandchild, and a background grandchild left after the plugin exited; an abort returns exit 130 with `aborted` and kills the tree.
- A `ghp_…` token in plugin output is redacted and output past the cap is truncated with a marker.

### REQ-plugins-114

The system SHALL measure the context cost of each loaded plugin command on the
exact tool definition sent to the model (`toolDefForEntry`), as JSON
characters and approximate tokens (chars/4), and SHALL report the loaded tool
surface as a whole (FLEDGE-5 / PLUGIN-6): total approximate tokens if every
loaded command were offered, a default budget of ~8000 tokens with an
over-budget flag, subtotals by origin (`builtin` or
`fledge:<plugin>@<version>`), the largest schemas, and commands whose schema
exceeds a ~250-token soft cap. `PluginCommand` MAY carry an `origin`; the
registry `list()` shape is unchanged.

Acceptance Criteria
- `withToolCost` adds `origin`, `schemaChars`, `approxTokens` (= ceil(schemaChars/4)) per entry.
- `toolSurfaceReport` totals match the per-entry sum, group by origin, and flag over-budget / oversized with small test budgets.
- The text view prints per-command `~N tok`, the total vs budget with `OVER BUDGET` when exceeded, per-origin subtotals and oversized names.

### REQ-plugins-094

`github-ci-status` SHALL report CI state for either a PR number or a ref
(branch, tag or commit SHA) (GITHUB-4). A selector of 1–9 digits SHALL be a
PR number (its head SHA is queried); any other selector SHALL be a ref that
passes git ref-name rules, and option-looking values (leading `-`) SHALL be
refused before any API call. The result SHALL carry an overall `verdict`:
`red` when any check run concluded failure/cancelled/timed_out/
action_required or any commit status is failure/error; otherwise `pending`
when any check or status is queued/in progress/pending or has no
recognised conclusion; otherwise `green` when every row succeeded, was
skipped or was neutral; `none` when there are no check runs and no commit
statuses. Legacy combined commit statuses
(`repos.getCombinedStatusForRef`) SHALL count toward the verdict. A ref
SHALL be resolved to one commit SHA (`repos.getCommit`) before listing, and
check runs and commit statuses SHALL both be read for that SHA (a PR uses
its head SHA), so one verdict never mixes two commits. When paging stops at
the cap (`truncated: true`) a verdict that would be `green` SHALL be
reported as `pending`. A 403 on commit statuses that denies the permission
SHALL degrade to check runs only with a warning; a rate-limit (primary or
secondary) or SSO/SAML 403 SHALL fail the command instead. Warnings SHALL be
included in the one-line message for every verdict, `none` included.
Per-check rows SHALL keep `name`, `state`, `bucket`, `link` (additive fields
only). The command SHALL stay `dangerous: false`, `minTier: 0`, behind the
`--repo` gate (GITHUB-6).

Acceptance Criteria
- `github-ci-status 12 --repo O/R` queries the PR head SHA; `main`, `v1.2.3`, a SHA and `heads/123` are queried as refs.
- `--flag`-looking and invalid refs (`a..b`, spaces, `x.lock`, `@{`) are refused with exit 1 before a token or API call.
- Verdict is green / red / pending / none per the rules above, with red winning over pending.
- A repo that only reports commit status contexts gets a verdict from them.
- A ref such as `main` is resolved once and every check-run and status page is read by that SHA; `data.sha` is the resolved SHA.
- A truncated listing whose seen rows all pass reports `pending`, not `green` (check runs or statuses hitting the cap); a seen failure stays `red`.
- A permission 403 on statuses gives a check-runs-only verdict plus a warning; a rate-limit or SSO 403 fails the command; the warning also shows for verdict `none`.
- Rows keep `name/state/bucket/link` and add `kind/status/conclusion`; `plugins list` still shows dangerous=false minTier=0; missing or denied `--repo` still exits 3.
- Tests use a mocked Octokit / stubbed transport only (no network, no real token).

### REQ-plugins-154

A bounded child process SHALL NOT outlive its limit (AGENT-3).
`src/plugins/proc-group.ts` SHALL provide the Linux process-tree stop used by
Fledge runs, delegate workers and spawned schedule/chat runs, which SHALL be
spawned with `detached: true` (their own session and process group).
Stopping a child SHALL signal every process group led by a member of its
tree, including the child's own group after the child exited, and every
descendant found by walking `/proc` parent links, so a grandchild that moved
to its own group or session is reached while its parent lives. A hard kill
SHALL freeze the tree with SIGSTOP, re-read `/proc` until no new member
appears, then SIGKILL. A graceful stop MAY first send SIGTERM and return the
members it saw, so a later hard kill still reaches grandchildren orphaned
meanwhile. Pid reuse SHALL be guarded: the root pid is used only while it is
still this process's child or matches a remembered start time, and a group
whose leader exited only through a remembered member still in it or a
snapshot taken as the leader exited. This process, its own process group and
pid 1 SHALL never be signalled, and the helpers SHALL never throw.

A tracked child SHALL be stopped with its tree when this process exits, and
when SIGINT, SIGTERM or SIGHUP arrives while no other listener handles that
signal; the signal SHALL then be re-raised with its default action. The hook
SHALL run before other listeners and count them, so a process that handles
the signal itself (the bridge's `once` handler, the daemon's grace) keeps its
own shutdown, and the exit hook stops what is left. A signal this process
started with ignored (the `SigIgn` mask in `/proc/self/status` at load, for
example SIGHUP under `nohup` or SIGINT in a background job) SHALL NOT be
hooked, so it stays ignored while a child is tracked and after the last one
is untracked. A caller MAY give the tracker its latest snapshot of the tree
(taken as the child exited); the exit and signal hooks SHALL use it, so what
the child left in its group is still stopped after the child is gone.
Signal and exit hooks SHALL be removed once no child is tracked.

Acceptance Criteria
- Real `sh` trees: a hard kill stops the child, a same-group grandchild and a `setsid` grandchild.
- A SIGTERM-ignoring grandchild orphaned by the child's exit is killed by a later hard kill given the SIGTERM snapshot.
- Synthetic `/proc` tables: descendants in any group and orphans in the root's group are members; unrelated processes, a recycled root pid (not our child), a recycled known pid (start time differs), this process and pid 1 are not.
- A parent that exits, or dies of SIGTERM with no other handler (exit by SIGTERM), leaves no tracked tree behind; a parent with its own SIGTERM or `once` SIGINT handler registered first keeps its grace and its tree dies at exit.
- Untracking the last child removes the signal hooks.
- A parent with no other handler dies by SIGHUP after its tracked tree is killed; a parent started with SIGHUP ignored survives SIGHUP while a child is tracked and after it is untracked (SIGHUP still ignored in its `SigIgn`), and SIGTERM still stops its tree.
- `SigIgn` parsing maps bit n-1 to signal n (SIGHUP, SIGINT, SIGTERM) and treats a missing mask as none.
- A parent tracking a child with its exit snapshot kills the grandchild that child left in its group when the parent exits.

### REQ-plugins-243

The `files-*`, `search-grep` and `shell-exec` builtins SHALL NOT silently
drop an argv token because it starts with `--`. A value flag (`--content`,
`--path`, `--old`, `--new`, `--pattern`, `--include`, `--command`)
SHALL take the next token verbatim, even one that starts with `--`, or an
inline `--flag=value`; a value flag with no value SHALL be an error. For
`files-*` and `search-grep` a token that is not a known flag SHALL stay
positional, and a bare `--` SHALL end option parsing. `shell-exec` SHALL
treat only leading `--json`, `--command`, `--cwd` and `--` as its own
options; every later token SHALL be part of the command verbatim, and words
left after `--command` SHALL be refused rather than dropped. `files-write`
SHALL refuse (exit 1, file unchanged) to replace a non-empty file with empty or
missing content unless `--allow-empty` is passed.

Acceptance Criteria
- `files-write` with `--content` or positional content that starts with `--` (YAML front matter, SQL comment) writes it verbatim; unknown `--` words in positional content are kept; `--content=value` works; with `--path` every positional is content.
- `files-write` with missing, empty or dangling `--content` over a non-empty file is refused and the file is unchanged; `--allow-empty` empties it.
- `files-edit --old / --new` accept values that start with `--`.
- `shell-exec echo git push --dry-run origin main` runs with `--dry-run` intact; a trailing `--json` stays in the command; leading `--json`/`--command`/`--command=` still work; `--command X --dry-run` is refused before spawn.
- `search-grep --no-verify src` searches for `--no-verify` under `src`; `--pattern` takes a `--` value, `--path=` works, and with `--pattern` the first positional is the path.

### REQ-plugins-253

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

### REQ-plugins-237

`files-edit` SHALL write the `--new` string byte-for-byte in place of the
`--old` match in both single-occurrence and `--replace-all` modes.
JavaScript replacement patterns in `--new` (`$$`, `$&`, `$'`, `` $` ``,
`$1`, `$<name>`) SHALL NOT be expanded; `--new` is literal data.

Acceptance Criteria
- A single-occurrence edit whose `--new` contains `$$`, `$'`, `$&`, `` $` ``, `$1` and `$<n>` leaves exactly that text in the file.
- A `--replace-all` edit with the same `--new` writes the same literal text at every match.

### REQ-plugins-267

In a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN` set and the acting
user is not ADMIN), the read-ish file and git tools SHALL apply the
ROLES-CHAT-8 secret-path gate `files-read` applies (`isSecretPath`: `.env*`,
`.ssh`, key files, keystores, credentials). `search-grep`, `files-list` and
`git-diff` SHALL refuse an explicit secret path, given positionally, with
`--path`, as `./`, `..` or absolute spellings, or through a symlink that
resolves to one, with exit 2 and the ROLES-CHAT-8 refusal message, before
reading anything. A recursive `search-grep` SHALL NOT return a line from a
secret file whatever `--include` is passed, `git-diff` (worktree or
`--staged`) SHALL NOT list or print a tracked secret file, and `files-glob`
and `files-list` SHALL leave secret paths out of their results, also when a
glob walks a symlink into a secret directory. ADMIN sessions and the local
CLI (no role session) SHALL keep the access `files-read` gives them. The
gate SHALL be re-checked on each call (ROLES-CHAT-6). No new plugin, flag,
env var or config key.

Acceptance Criteria
- Non-ADMIN `search-grep` over the project returns no line from `.env`, `.env.local`, `.ssh/*`, `*.pem`, `*keystore*`, `credentials.json` or a case variant such as `sub/.ENV`, and still returns lines from ordinary files.
- Non-ADMIN `search-grep <pattern> .env` (also `./.env`, `src/../.env`, the absolute path, `--path .env`, `--path=.env`, `--pattern X .env`) and `search-grep` of `.ssh`, a `.pem`, a keystore or a credentials file is refused with exit 2 and a ROLES-CHAT-8 error, like `files-read .env`.
- Non-ADMIN `search-grep` with `--include=.env`, `--include env`, `--include=*.pem`, `--include pem,ts` or `--include *` returns no secret line.
- Non-ADMIN `search-grep` or `files-list` of a symlink to `.env` or `.ssh` is refused with exit 2; a recursive search does not follow such a symlink.
- Non-ADMIN `files-glob` (`**/*`, `.env*`, `**/*.pem`, `.ssh/*`, and `notes/*` where `notes` links to `.ssh`) and `files-list --show-hidden` return no secret path; `files-list .ssh` is refused with exit 2.
- Non-ADMIN `git-diff`, `git-diff .` and `git-diff --staged` list and print no tracked secret file (`.env*`, `.ssh/*`, `*.pem`, keystores, credentials, key files, case variants such as `sub/.ENV`) and still show ordinary files; `git-diff .env` (also `./.env`, `src/../.env`, the absolute path, `.ssh`, a `.pem`, a keystore dir or a symlink to a secret) is refused with exit 2; user paths stay literal pathspecs.
- ADMIN and the local CLI still read `.env` with `files-read`, grep it explicitly and recursively, see secret paths in `files-glob` / `files-list`, and see tracked secret files in `git-diff`.

### REQ-plugins-287

`appendAudit` SHALL take the shared DB write lock before it reads the
previous chain hash (BEGIN IMMEDIATE), so a concurrent writer in another
process is waited for under the DB busy_timeout instead of failing at once
with "database is locked", and the new row links to the latest committed row.
A SAFE-5 row for a dangerous run SHALL NOT be lost only because another
process was writing the shared DB. When the lock is not free within
busy_timeout the append still fails, and `runPlugin` still refuses a run
whose `started` row cannot be written (REQ-plugins-095). No new env var,
config key, pragma, slash command or plugin.

Acceptance Criteria
- While another process holds the write lock and then commits, `appendAudit` waits and succeeds; its `prev_hash` is the other writer's row hash and the chain verifies.
- Concurrent appenders in several processes lose no rows.
- Several processes that each open the shared DB file, append one row and close it (as dangerous plugin runs do), all at once, get every append in and the chain verifies.

### REQ-plugins-312

The system SHALL register a read-only plugin `discord-user-lookup` (not dangerous, not mutating) that resolves a Discord guild member by snowflake user id (`--user-id`) or name query (`--query`) via the Discord REST API, scoped to the configured `DISCORD_GUILD_ID` only (IDENTITY-5 / DISCORD-13). A `--guild` that does not match the configured guild SHALL be refused. Empty `DISCORD_GUILD_ID` SHALL refuse. Arbitrary other guilds SHALL NOT be looked up. Dry-run (`CORVIDINHO_DISCORD_DRY_RUN=1`) SHALL succeed without a live call.

Acceptance Criteria
- `plugins list` shows `discord-user-lookup` with dangerous=false.
- Missing guild / wrong `--guild` → refuse exit 3 without REST.
- Dry-run by id or query succeeds with `dryRun: true`.
- Mocked REST returns display name / username / id; 404 → clean not-a-member error.
- Fixture: `tests/discord.user-lookup.test.ts`.

