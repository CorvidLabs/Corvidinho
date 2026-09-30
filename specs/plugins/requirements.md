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

Built-in read-only GitHub commands SHALL call GitHub via Octokit (`GITHUB_TOKEN`/`GH_TOKEN`), not shell `gh` (GITHUB-1/4). The Octokit token (read and write commands alike) SHALL be `GITHUB_TOKEN`, else `GH_TOKEN`, each trimmed: a blank (whitespace-only) token SHALL count as missing, as WATCH reads it, so it never shadows the other and never reaches Octokit as the credential; with no usable token `createOctokit` SHALL refuse with its missing-token error before any request. No env var or config key is added.

Acceptance Criteria
- github-pr-list/status/ci-status/issue-list use `@octokit/rest`.
- No `Bun.spawn(["gh", ...])` in plugin bodies.
- `getGithubToken` with a whitespace-only `GITHUB_TOKEN` and a real `GH_TOKEN` returns the `GH_TOKEN`; `GITHUB_TOKEN` still wins when both are real; blank tokens only return no token and `createOctokit` refuses with `missing GITHUB_TOKEN or GH_TOKEN`.

### REQ-plugins-004

GitHub plugins SHALL require `--repo OWNER/REPO` and enforce default-deny allowlists for orgs/repos (and user checks when supplied): empty allow ⇒ refuse; deny always wins; allow match required (GITHUB-6 / ALLOW-1,2,5). Never empty→allow-all.

Acceptance Criteria
- Missing `--repo` exits non-zero with GITHUB-6 message.
- Empty allowlist + any repo ⇒ deny (not authorized).
- Denied repo exits with code 3 and clear error.
- Allow-listed repo/org match ⇒ ok unless also denied.
- `git-push` with `CORVIDINHO_GITHUB_ALLOW_REPOS` naming the remote's repo and `CORVIDINHO_GITHUB_DENY_ORGS` naming its owner is refused with exit 3 and an org-denied error, and the remote ref is not created (the test fails with the `deny_orgs` check removed from `isRepoAllowed`).

### REQ-plugins-005

Allowlists SHALL default-deny: empty or missing allow entries refuse targeted GitHub plugin runs and Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny overrides always win. Empty lists MUST NOT map to allow-all or Merlin BASIC.

`isChannelDenied` (`src/allowlist/discord.ts`) SHALL report a
`deny_channels` hit alone, case-insensitively and trimmed like
`checkChannel` (which uses it), so a thread gate can make a deny on the
thread or its parent win over the other being allowlisted (REQ-discord-212).

Acceptance Criteria
- Empty/missing allowlist refuses GH `--repo` targets (exit 3 / not authorized).
- Discord stub `checkChannel`/`checkRole`/`checkUser` refuse when allow lists empty.
- Regression: empty allow never permits a target (Merlin empty→BASIC forbidden).
- `isChannelDenied` is true for a deny-listed id (any case, surrounding space trimmed) and false for allowlisted, unlisted, empty or missing ids; `checkChannel` reports that id as denied.

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

### REQ-plugins-007

The system SHALL expose a Discord allowlist stub API (channel/role/user) for future HEAR (#5) without implementing the full Discord bridge.

Acceptance Criteria
- Exported `checkChannel` / `checkRole` / `checkUser` (or equivalent) honor default-deny + deny override.
- No Discord gateway/bridge process in this change.


### REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-score`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

`specsync-check` SHALL run `fledge run spec-check` only when `fledge` is on PATH and the project's own `fledge.toml` defines a `spec-check` task; otherwise it SHALL run the local `specsync check` (SPECSYNC-2/7). A `fledge.toml` that cannot be read or parsed SHALL keep the Fledge path (fail closed). `specsync-score` SHALL be read-only (tier 0, not dangerous) and return the local `specsync score` report with the forwarded args (SPECSYNC-3).

The tools SHALL stay inside the project: they read this repo's `specs/` and the companions next to a spec, using project files only (SPECSYNC-1 / SPECSYNC-5 / SPECSYNC-6), as typed plugin commands (PLUGIN-1). `specsync-read` and `specsync-brief` SHALL accept only a plain module name (letters, digits, `_` or `-`, the form `.specsync/registry.toml` names use; an optional `name=` prefix is stripped first) and SHALL refuse any other name before reading anything. Every file they read (the module spec, the legacy flat spec and each companion) SHALL resolve, with symlinks followed, inside the real path of the project's `specs/` dir, which SHALL itself resolve inside the real project root. `specsync-coverage`, `specsync-score`, `specsync-change-list` and `specsync-ship-status` SHALL refuse a forwarded `--root` argument before spawning `specsync`.

Acceptance Criteria
- `plugins list` includes the SpecSync command names, `specsync-score` among them.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- With no `.specsync/registry.toml` in a project whose `.specsync/` is a dir (the layout `specsync init` + `specsync scaffold <name>` leave), `specsync-list` and `corvidinho specsync list` return, sorted, each module name with a `specs/<name>/<name>.spec.md` (a plain module name; the spec a file resolving inside the real `specs/` dir); a listed name reads with `specsync-read` / `specsync-brief`, and the Planning spec briefing (`loadRelevantSpecs`) includes that module's constraint sections and its `context.md` / `tasks.md` companions (SPECSYNC-1 / SPECSYNC-5).
- When `.specsync/registry.toml` exists its `[specs]` names are listed together with those `specs/` modules (sorted, each once), so a module scaffolded after `specsync init-registry`, which the registry does not name, is still listed and briefed. With no `.specsync/` dir, no `specs/` dir, or a `specs/` dir resolving outside the project, no name is listed from `specs/`; a legacy flat `specs/<name>.md`, a dir without its spec, a spec that is a dir, a name that is not a plain module name, and a spec or module dir that links outside `specs/` are not listed from `specs/` and never reach the Planning briefing.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- With fledge on PATH and a project `fledge.toml` that has no `spec-check` task, or no `fledge.toml`, `specsync-check` runs `specsync check` and returns its result (no `Unknown task 'spec-check'` failure); with the task defined it runs `fledge run spec-check` and a failing task fails `specsync-check` (exit 1, `spec check failed`).
- `projectDefinesSpecCheckTask` is true for a `fledge.toml` that cannot be parsed, false for one without the task or no file.
- `specsync-score [args]` spawns the local `specsync score [args]` (e.g. `cli --explain`, `--format json`) and returns its report; a non-zero `specsync score` exit (e.g. `--min-score`) passes through with the report. It is offered in the default tool-tier catalog.
- `specsync-brief <module>` returns companion files when present.
- `specsync-read` / `specsync-brief` with a name that is not a plain module name — a relative traversal (`../../<outside>/outside`, `../../../..<abs>`), an absolute path, `.` / `..`, a path separator (`/` or `\`), a NUL byte or any other character — fail with exit 1 and a one-line `invalid spec module name` error (the name JSON-escaped, never a raw NUL) and read nothing.
- A module spec, legacy flat spec, module dir or companion that is a symlink resolving outside the project's `specs/` dir, or a `specs/` dir that resolves outside the project root, is refused with exit 1 and a `resolves outside` error naming only the in-project path; a refused companion fails the whole brief; no outside content is returned.
- Symlinks that stay inside `specs/` still read, and a missing module still reports `spec '<name>' not found`.
- `specsync-coverage`, `specsync-score`, `specsync-change-list` and `specsync-ship-status` given `--root <dir>` or `--root=<dir>` fail with exit 1 (`refused: --root is not allowed; SpecSync tools run on this project only`) and `specsync` is not spawned.
- A tool-loop `specsync-read` call with a traversal name returns the refusal to the model, not the outside file.
- The Planning spec briefing (`loadRelevantSpecs`), which reads through the same helpers, leaves out a registered module whose spec or module dir resolves outside `specs/` and never includes a companion that does.

### REQ-plugins-009

The system SHALL register `discord-post-message` as a **dangerous** plugin (externally visible write). Non-interactive runs SHALL deny unless allowlisted (SAFE-1). Channel target MUST pass Discord channel allowlist (DISCORD-5 / ALLOW-3).

That channel allowlist SHALL be the same set the bridge and daemon gate on
(REQ-discord-004, `mergeChannelIds`): the allowlist file
`[discord].channels` plus `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, union
`DISCORD_CHANNEL_IDS`. So a channel allowlisted only through
`DISCORD_CHANNEL_IDS` SHALL pass the gate. Deny lists SHALL still win: a
channel in `CORVIDINHO_DISCORD_DENY_CHANNELS` or the file's
`deny_channels` SHALL be refused even when it is also in
`DISCORD_CHANNEL_IDS`. A channel in no list SHALL still be refused, and a
malformed or unreadable allowlist file SHALL still refuse (fail closed,
REQ-plugins-006). No env var, flag, config key or command is added.

Acceptance Criteria
- `plugins list` shows `discord-post-message` with dangerous=true.
- Non-interactive without allowlist → deny (exit 2).
- Missing/empty channel allowlist or non-allowlisted channel → not authorized.
- No allowlist file, `CORVIDINHO_DISCORD_ALLOW_CHANNELS` unset, `DISCORD_CHANNEL_IDS=111`, dry run: a post to `111` succeeds (exit 0); a post to a channel in no list is refused (exit 3, not allowlisted).
- The same with `CORVIDINHO_DISCORD_DENY_CHANNELS=111` added: the post to `111` is refused (exit 3, denied).

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

github-pr-create SHALL append plain Made with Corvidinho markdown attribution when missing and SHALL NOT insert @handles. The attribution SHALL count as present only when the body holds its canonical markdown (`ATTRIBUTION_MARKDOWN`) or plain (`ATTRIBUTION_PLAIN`) form from `src/attribution.ts`; a body that merely contains the words "Made with" and "Corvidinho" SHALL still get the footer.

Acceptance Criteria
- dry-run body contains Made with Corvidinho link and no @Corvidinho.
- A dry-run body `Made with Bun; fixes the Corvidinho watch poller.` comes back with `\n\n---\n` and `ATTRIBUTION_MARKDOWN` appended; a body that already holds `ATTRIBUTION_MARKDOWN` or `ATTRIBUTION_PLAIN` comes back unchanged (no second footer).

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
basename `fledge.toml`, any `.fledge` path component (Fledge lane imports
and config such as `.fledge/lanes/*.toml`, which the verify gate runs, so a
run cannot weaken the checks it is verified by: SAFE-2.a; reads stay
allowed), basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, SpecSync state under `.specsync/` (config, registry,
version, archive, and `.specsync/changes` / `.specsync/changes/<id>`
themselves) except the files inside an active change folder
`.specsync/changes/<id>/` (which stay writable so change artifacts can be
filled, SPECSYNC-4), and any path component inside the project containing
`keystore` (a keystore file such as `wallet-keystore.json` or any file under a
keystore directory such as `keystore/UTC--…`). Components of the project
root's own absolute path SHALL NOT be matched against `keystore`, so a project
checked out under a keystore-named directory keeps its ordinary files
writable; nor SHALL a SpecSync change folder's name (`.specsync/changes/<id>/`,
`.specsync/archive/changes/<id>/`), which is a slug of the change title.

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.
- files-write, files-edit and files-delete of a file under a keystore directory (`keystore/UTC--…`, `config/Keystore/wallet.json`), a new file there, or a symlink resolving into one are refused with SAFE-2 (exit 2) and the file is unchanged / not created.
- files-write, files-edit and files-delete of `.specsync/config.toml`, `.specsync/registry.toml`, a new `.specsync/` top-level file or a `.specsync/archive/` file are refused with SAFE-2 (exit 2); a file under `.specsync/changes/<id>/` is still written, also when `<id>` contains `keystore`; files-write of `.specsync/changes` or `.specsync/changes/<id>` itself is refused and nothing is created.
- In a project whose root directory name contains `keystore`, files-write (relative or absolute path) and files-edit of ordinary files succeed, and `keystore/…` inside it is still refused.
- git-commit refuses to stage the deletion of `.specsync/config.toml` (exit 2, SAFE-2) and stages the deletion of a `.specsync/changes/<id>/` file.
- files-write, files-edit and files-delete of a file under `specs/` that does not end in `.spec.md` (`specs/agent/requirements.md`, `specs/agent/context.md`) and files-write of a new `specs/notes.md` are refused with SAFE-2 (exit 2); the files are unchanged and the new file is not created (the test fails with the `specs` component rule removed).
- files-write, files-edit and files-delete of `.fledge/lanes/verify.toml` and `.fledge/config.toml` (also spelled `./.fledge/…`, `src/../.fledge/…`, `.FLEDGE/…` or as an absolute path, through a symlink to the lane file or a symlink to `.fledge/lanes`), files-write of a new `.fledge/lanes/extra.toml`, of a dangling symlink to a missing lane file and of `.fledge` itself in a project without one are refused with the SAFE-2 refusal (exit 2, text names `.fledge`); the files are unchanged and nothing is created; files-read and files-list of `.fledge/` still work (SAFE-2.a; the test fails with the `.fledge` component rule removed).
- git-commit refuses to stage the deletion of a tracked `.fledge/lanes/verify.toml` or `.fledge/config.toml` (exit 2, SAFE-2); the path stays in `ls-files` and nothing is staged (SAFE-2.a; fails with the `.fledge` rule removed).

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

The one-line chain summary (`formatAuditLine`: the bridge start log and
`/status`, REQ-discord-095) SHALL read `chain BROKEN at #N` for every break
`verifyAudit` reports at a row it could check: with the key, and also without
the key when the first tampered row comes before any keyed row (a tampered
unkeyed chain, or a tampered unkeyed prefix), since a SHA-256 link needs no key
to check. Only a verify that stops at a keyed row because no key is set SHALL
read `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`.

Acceptance Criteria
- Allowed dangerous run appends started + ok rows; raw args are not stored.
- Non-interactive denial appends a denied row; safe plugins append nothing.
- A dangerous run is refused when its started row cannot be written.
- Tampering is detected at the first bad row; wrong/missing key fails verify.
- A keyed row that follows a keyed row, edited and relinked with the rows after it as unkeyed SHA-256 links, fails verify with the key at that row (`chain BROKEN at #N`).
- Without the key, appending after a keyed row is refused, so a keyless dangerous run fails closed and the chain stays keyed; an unkeyed prefix followed by keyed rows still verifies (`mixed keyed/unkeyed`).
- Without `CORVIDINHO_AUDIT_HMAC_KEY`, a tampered unkeyed chain (no keyed rows) reads `Audit: N entries · chain BROKEN at #n` at the first tampered row, the same line as with a key, and so does a tampered unkeyed prefix before keyed rows; an intact unkeyed prefix before keyed rows, or a keyed chain, read without the key still reads `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`.
- An edit to any one stored column of a keyed row made behind a dropped update trigger — `ts`, `action`, `actor`, `surface`, `args_digest`, `outcome`, `exit_code`, `keyed`, `prev_hash` or `hash` — fails verify with the key at that row (`chain BROKEN at #N`).
- A dangerous run whose handler returns `ok: false` appends `started` (no exit code) then `error` with the handler's exit code; a dangerous run whose handler throws appends `started` then `error` with exit code 1, and the throw still reaches the caller.

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
of SAFE-2 protected paths (`isProtectedPath`) and any `.env*`, keystore (any
path component containing `keystore`, with the REQ-plugins-083 SpecSync change
folder exception) or `.git` path, SHALL commit only the named paths, and SHALL report the
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
- git-commit of a file under a keystore directory (`keystore/UTC--…`, `config/Keystore/wallet.json`) is refused (exit 2) and nothing is staged; a SpecSync change whose id contains `keystore` is still committed and archived (the deletion under `.specsync/changes/<id>/` and the new `.specsync/archive/changes/…` copy).
- A plugin cwd that is a subdirectory of a repository (not the top level) is refused; unknown flags are refused.
- Hooks in `.git/hooks` or a repo-local `core.hooksPath` never run on git-commit / git-push; git-status and git-commit work at the top level of a linked worktree (`.git` is a file).
- git-push to a local bare remote is refused when OWNER/REPO is not allowlisted or is denied (exit 3) and succeeds when allowlisted; force/refspec args are refused (exit 2); a non-fast-forward push is rejected without force and the remote ref is unchanged; detached HEAD is refused.
- git-commit refuses to stage the deletion of a tracked file under `specs/` that does not end in `.spec.md` (`specs/x/requirements.md`, `specs/notes.md`) with exit 2 and SAFE-2; the path stays in `ls-files` and nothing is staged (the test fails with the `specs` component rule removed).

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

The clamp SHALL run after the SAFE-21 foot-gun check (REQ-plugins-494), so a
command that is both a foot-gun and a clamp refusal is refused with the
SAFE-21 reason; the clamp on its own still refuses it. It SHALL also check
`env -C` / `sudo -D` directories, symlinks and `ln` targets as REQ-plugins-495
says.

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
- Quoting is read as the shell reads it: `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..`, `cd 'a b'/../..` and `cd sub/..\`+newline+`/..` refuse; so does a `cd /etc` after an escaped backslash and a newline (`echo a\\`+newline), after a `#` comment holding a quote, after a here-doc body holding a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`), or after a `$(…)` whose comment or here-doc holds a `)`; an escaping `cd` in a `$(…)` or backtick of an unquoted here-doc body refuses, also when the delimiter holds a backtick (`cat <<`+backtick+`x`+newline+`#' $(cd ..)`); `(( x = 1 << 2 ))`+newline+`cd /etc` refuses, also inside `eval` when quote removal forms the `<<`; `cd "sub`, `cd 'sub` and `cd sub\` refuse; `$(`-nesting too deep to check refuses instead of throwing; `cd sub # comment`, `cd sub \`+newline+`&& ls`, and an in-root `cd sub` after a here-doc whose body holds a stray quote or apostrophe stay allowed; `eval "cd /; ls"` refuses `/`. End to end each refused form returns exit 2 with SAFE-3 (or SAFE-21 when the form is also a SAFE-21 foot-gun, REQ-plugins-494) and nothing is spawned.
- bash `$'…'` is read as bash reads it: `echo $'\''; cd /etc #'` refuses, and so do `cd $'\x2e\x2e'` and `$'\x63d' /etc`. A shell's `-c` string is checked like an `eval` argument: `sh -c 'cd /etc'`, `/bin/sh -ec 'cd /etc'`, `bash --norc -o pipefail -c 'cd ..'`, `env X=1 sh -c 'cd /etc'`, `timeout 5 sh -c 'cd /etc'`, `xargs sh -c 'cd /etc'`, `find . -exec sh -c 'cd /etc' \;` and `sh -c "cd $X"` refuse; `sh -c 'cd sub && ls'`, `bash -lc 'echo hi'` and `bash scripts/build.sh` (an in-root script) stay allowed.
- Expansion forms refuse: `$(echo cd) /etc`, `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)`; `echo $(cd sub && ls)` and `eval 'cd sub'` stay allowed.
- Bash `X+=1 cd /etc` refuses; a `DIRSTACK[...]=` write refuses.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`; a command that sets `CDPATH` to an outside dir and then runs a relative `cd sub` does not print the outside path.
- Scripts a command runs in a shell are checked, with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, a `#!`-less text file or `#!/usr/bin/env -S bash -e` script run by path, `env X=1 ./bad.sh`, `timeout 5 ./bad.sh`, `exec ./bad.sh`, `find . -exec ./bad.sh \;`, `BASH_ENV=./bad.sh bash -c true`, `bash --rcfile bad.sh -i ok.sh`, `sh < bad.sh`, `sh -s arg < bad.sh`, a nested `. ./nested.sh` and `cd sub && . ./inner.sh` (`cd ../..`) refuse, naming the script (`/etc (in ./bad.sh)`); so do `sh <<'EOF'`+newline+`cd /etc`+newline+`EOF`, an unquoted here-doc whose body expands to `cd /etc` (`c\\d /etc`), `bash <<< 'cd /etc'`, shell input that would expand (`sh <<EOF` with a `$`, `bash <<< "$X"`), `cat bad.sh | sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)`, `. <(cat bad.sh)`, `sh missing.sh`, `sh "$S"`, `. ~/x.sh`, `sh *.sh`, a script over 1 MiB, and a script the command writes (`echo … > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done`). `trap 'cd /etc' EXIT`, `trap "$X" EXIT`, `alias c=cd`, `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` refuse. `sh ok.sh`, `./ok.sh && ./okcd.sh` (`cd sub`), `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `sh <<'EOF'`+newline+`cd sub && pwd`+newline+`EOF`, `bash <<< 'echo hi'`, a binary or `#!/usr/bin/env python3` file run by path, a program the command builds first, and `trap 'rm -f tmp.txt' EXIT` stay allowed. End to end each refused form returns exit 2 with SAFE-3 (or SAFE-21 when the form is also a SAFE-21 foot-gun, REQ-plugins-494) and nothing is spawned; in-root scripts run.
- End to end, `cp bad.sh gen.sh; sh gen.sh` refuses with exit 2 and nothing spawned; its `>` and `tee` forms (`echo … > gen.sh; sh gen.sh`) are refused first by SAFE-21 (an edit), still exit 2 with nothing spawned, while `firstDisallowedCd` alone still refuses them.

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
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496) the per-hop check
SHALL also refuse, before DNS, a hop to a GitHub host (`github.com`,
`*.github.com`, `githubusercontent.com`, `*.githubusercontent.com`) that does
not name a GITHUB-6-allowlisted `OWNER/REPO` (DISCORD-SCHEDULE-3.a); the
handler SHALL pass the run's env (`deps.env`, default `process.env`) to
`webFetch`.

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
- In a scheduled run a direct URL or a redirect into `raw.githubusercontent.com` for a repo off the allowlist is refused on that hop; outside one it is fetched (`tests/github.schedule-repo-gate.test.ts`).

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
While it waits it SHALL try the lock again every millisecond until
busy_timeout has passed, not only at SQLite's busy-handler back-off (one try
per 100 ms), so other processes that commit back to back cannot pass it over
for the whole busy_timeout while the lock is free between their commits.
A SAFE-5 row for a dangerous run SHALL NOT be lost only because another
process was writing the shared DB. When the lock is not free within
busy_timeout the append still fails, and `runPlugin` still refuses a run
whose `started` row cannot be written (REQ-plugins-095). No new env var,
config key, pragma, slash command or plugin.

Acceptance Criteria
- While another process holds the write lock and then commits, `appendAudit` waits and succeeds; its `prev_hash` is the other writer's row hash and the chain verifies.
- Concurrent appenders in several processes lose no rows.
- Several processes that each open the shared DB file, append one row and close it (as dangerous plugin runs do), all at once, get every append in and the chain verifies.
- While another process holds the write lock for about a second, frees it for 50 ms and then holds it past busy_timeout, `appendAudit` takes the lock while it is free; its row links to the other process's row, the chain verifies and the connection keeps its busy_timeout.

### REQ-plugins-312

The system SHALL register a read-only plugin `discord-user-lookup` (not dangerous, not mutating) that resolves a Discord guild member by snowflake user id (`--user-id`) or name query (`--query`) via the Discord REST API, scoped to the configured `DISCORD_GUILD_ID` only (IDENTITY-5 / DISCORD-13). A `--guild` that does not match the configured guild SHALL be refused. Empty `DISCORD_GUILD_ID` SHALL refuse. Arbitrary other guilds SHALL NOT be looked up. Dry-run (`CORVIDINHO_DISCORD_DRY_RUN=1`) SHALL succeed without a live call.

Acceptance Criteria
- `plugins list` shows `discord-user-lookup` with dangerous=false.
- Missing guild / wrong `--guild` → refuse exit 3 without REST.
- Dry-run by id or query succeeds with `dryRun: true`.
- Mocked REST returns display name / username / id; 404 → clean not-a-member error.
- Fixture: `tests/discord.user-lookup.test.ts`.

### REQ-plugins-313

When `node`, `python3` (else `python`) or `cargo` resolves on an absolute
PATH entry at builtin load, the system SHALL register `node-exec`,
`python-exec` or `cargo-exec` respectively (PLUGIN-4), bound to the absolute
binary found. A relative PATH entry SHALL NOT be used to resolve a runner, and
a hit whose real path is the running Bun binary (the `node` shim `bun run` puts
on PATH) SHALL NOT count as the toolchain; resolution continues on PATH. Each
runner SHALL be `dangerous: true` and `minTier: 2` (PLUGIN-2), so a
non-interactive run that has not allowlisted it is denied (SAFE-1), every run
is audited (SAFE-5), non-ADMIN role sessions never see or run it
(ROLES-CHAT-2/3), and the tool catalog offers it only at code tier with
dangerous tools included. A runner SHALL spawn `[bin, ...argv]` with the
caller's argv verbatim (no shell, no expansion, its own flags kept) and SHALL
pin the child's cwd to the plugin cwd (project root / task worktree), with no
cwd option. The child SHALL get the verify lane's scrubbed env (no Discord
config, GitHub tokens, audit key, acting identity or LLM keys) without
`CDPATH` / `OLDPWD` and without the owner's GitHub or git credentials
(SAFE-21.a, the env of REQ-plugins-495), stdin closed, a timeout (exit 124), per-stream output
caps, and its process group killed on timeout or the calling run's abort (exit
130); output SHALL be secret-scrubbed (SAFE-6). A non-zero exit SHALL return
ok=false with that exit code; empty argv SHALL be a usage error (exit 1) that
spawns nothing. `shell-exec` gets the same env (REQ-plugins-495). No new slash command,
env var or config key.

Acceptance Criteria
- With stub `node`, `python3` and `cargo` on PATH, `node-exec`, `python-exec` and `cargo-exec` are registered with dangerous=true, mutating=true, minTier=2; a second load keeps the same commands.
- `python-exec` binds `python3` when both `python3` and `python` exist and `python` when only it exists; a toolchain only on a relative PATH entry is not resolved.
- A `node` that is a symlink to the running Bun binary is skipped: with only it on PATH `node-exec` is not loaded (`node not found on PATH`), with a real `node` later on PATH that one is bound; `bun run corvidinho plugins list` without node lists no `node-exec`.
- `python-exec` with `` ["-c","x","$(id)","--json","a b","*","--","`id`"] `` reaches the binary as exactly those argv words, with cwd = the project root; a stub exit 3 returns ok=false, exitCode 3.
- The child env has no `GITHUB_TOKEN`, `DISCORD_TOKEN`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*`, `CDPATH` or `OLDPWD`, and `CORVIDINHO_PROJECT_ROOT` is the project root.
- Non-interactive with an empty allowlist each runner is denied (exit 2, SAFE-1) and nothing is spawned; allowlisted, it runs.
- `buildOpenAiTools` lists the runners at code tier with dangerous tools for ADMIN only; not at tool tier, not without dangerous tools, not for a non-ADMIN session.
- An aborted calling run returns exit 130 and kills the runner's process tree; a run past the timeout returns exit 124 and kills the tree.
- Where real `node` / `python3` / `cargo` are installed, `node-exec -e 'console.log(process.cwd())'` and `python-exec -c 'import os; print(os.getcwd())'` print the project root and `cargo-exec --version` succeeds.
- The child env also has no `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, inherited `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` / `GIT_CONFIG_PARAMETERS`, and has `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_COUNT=3` with empty `credential.helper` / `http.extraHeader` / `http.https://github.com/.extraHeader`, `GIT_TERMINAL_PROMPT=0`, a key-less `GIT_SSH_COMMAND`, `CARGO_NET_GIT_FETCH_WITH_CLI=true` and a `GH_CONFIG_DIR` with no `hosts.yml` (SAFE-21.a).

### REQ-plugins-314

A language runner whose toolchain is missing SHALL degrade cleanly (PLUGIN-4):
it SHALL NOT be registered, so it is never offered to the model and never
listed as a command; `corvidinho plugins list` SHALL still exit 0 and SHALL
print one line per missing runner naming the missing tool (`<name> not loaded:
<tool> not found on PATH`) next to the runners that loaded and their binary;
every other builtin (`shell-exec`, `files-*`, …) SHALL load unchanged. A
registered runner whose binary can no longer start SHALL return ok=false with
exit 127 and the reason instead of throwing.

Acceptance Criteria
- With an empty PATH (or no PATH) none of the three runners is registered, the load report lists each as missing, and `runnerStatusLines` prints `Language runners (PLUGIN-4): none loaded` and `node-exec not loaded: node not found on PATH`, `python-exec not loaded: python3 / python not found on PATH`, `cargo-exec not loaded: cargo not found on PATH`; `buildOpenAiTools({tier:"code",includeDangerous:true})` has no runner.
- With only `python3` on PATH, only `python-exec` loads and the other two are reported not loaded.
- `loadBuiltins()` with PATH lacking the toolchains still registers `shell-exec` and `files-*`; with only `node` on PATH it also registers `node-exec` alone.
- After a registered stub binary is deleted, calling the runner returns ok=false, exit 127 with `<name>: <tool> could not start`, and the promise does not reject.
- `corvidinho plugins list` with no toolchain on PATH exits 0, lists `shell-exec`, prints the `none loaded` and per-runner `not loaded` lines and lists no runner command; with only `cargo` on PATH it lists `cargo-exec  [dangerous, tier>=2]` and `cargo-exec (<bin>)`.
### REQ-plugins-427

`files-read` SHALL recognise a PNG, JPEG, GIF or WebP file by its leading
magic bytes (not its name) and, after the path clamp (REQ-plugins-082), the
ROLES-CHAT-8 secret-path gate and the existing-file check, SHALL return it as
an image the model can look at (DISCORD-9): `data` `{path, bytes, mediaType,
image: true}` and the message `image <path> (<mime>, N bytes) opened for
viewing`, with no UTF-8 `content`. The file's bytes SHALL travel base64 only on
`PluginHandlerResult.image` `{path, mediaType, base64}`, which is never
serialized into tool text, events, ndjson or CLI output; the agent tool loop
sends it to the model as an image part (REQ-agent-428). An image over 20 MB
(`MAX_IMAGE_SIZE_BYTES`, the Discord attachment cap) SHALL be refused with a
clear error and no bytes. Any other file SHALL read exactly as before. No new
env var, flag or command.

Acceptance Criteria
- files-read of a real PNG under `<cwd>/.corvidinho/attachments/` returns `data.image` true, `mediaType` `image/png` and no `data.content`; `image.base64` round-trips to the file bytes; `{ok, message, data}` stringified is under 1 KB with no U+FFFD and no base64.
- JPEG / GIF / WebP heads are images whatever the name; a text file named `.png` reads as text; a PNG named `.txt` is an image.
- An image over 20 MB is refused (`refused: image '<path>' is N bytes, over the 20MB image limit`); an image of exactly 20 MB is still read.
- A text file read still returns `{path, bytes, content}` with the content as the message.
- A PNG outside the root, or at a secret path in a non-ADMIN role session, is refused with no `image`.
- Fixture: `tests/files.plugins.test.ts` ("files-read image mode"), no network.

### REQ-plugins-461

Fledge itself SHALL be available as typed builtin plugin commands (PLUGIN-1),
registered by `loadBuiltins` whether or not fledge is installed, next to the
Fledge plugin bridge (`fledge-<command>`, REQ-plugins-112..113):
`fledge-lanes-list` and `fledge-lanes-validate` SHALL be `dangerous: false`
with `minTier` 0 (they only read the project's lane sources, `fledge.toml`
and `.fledge/lanes/*.toml`), and
`fledge-lanes-run` and `fledge-run` SHALL be `dangerous: true` with
`minTier` 2 (they run the project's own commands), so a non-interactive run
that has not allowlisted them is denied (SAFE-1), every run is audited
(SAFE-5), non-ADMIN role sessions never see or run them (ROLES-CHAT-2/3), and
the tool catalog offers them only at code tier with dangerous tools included
(PLUGIN-2). Each SHALL run the fledge binary found, when the command runs, on
the absolute PATH entries only, as an argv array (no shell) with cwd pinned to
the plugin cwd (project root / task worktree): `fledge --non-interactive lanes
list --json` (no args accepted); `fledge --non-interactive lanes validate
--json`, plus `--strict` when that is the only arg (no path or other arg
accepted); `fledge --non-interactive lanes run <lane>` (exactly one lane
name); `fledge --non-interactive run <task>`, plus `-- <args…>` verbatim when
args follow the task. A lane or task name SHALL match
`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$` (no leading `-`), so model argv never
becomes a fledge option; a refused name or arg SHALL be a usage error (exit 1)
that spawns nothing. `fledge-lanes-list` SHALL return typed lanes (name,
description, step count, fail-fast, trust tier) and `fledge-lanes-validate`
typed results (valid, strict, lane count, errors, warnings; ok=false when
fledge reports an error, or a warning under `--strict`); fledge's absolute
path is not passed on and parsed text SHALL be cleaned of control characters
and length-capped. A lane or task run SHALL return ok only on exit 0, else
ok=false with fledge's exit code and output. The child SHALL get the verify
lane's scrubbed env (no Discord config, GitHub tokens, audit key, acting
identity or LLM keys) without `CDPATH` / `OLDPWD`, with
`FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`, stdin closed, a
timeout (30 s for list / validate, 10 minutes for a run; exit 124),
per-stream output caps, and its process group killed on timeout or the
calling run's abort (exit 130); output SHALL be secret-scrubbed (SAFE-6).
Fledge missing from every absolute PATH entry SHALL return ok=false, exit
127, never a throw. Because fledge prints the offending line of a lane source
it cannot parse, before `fledge-lanes-list` or `fledge-lanes-validate` starts
fledge each lane source that exists SHALL resolve (symlinks followed) to a
regular file inside the real project root (`.fledge/lanes` to a directory
there) whose path, as named and as resolved, is not a secret path (`.env*`,
`.ssh`, keys, keystores), else the call SHALL be refused (exit 2, fledge not
started) with the project-relative path and never the link target
(ROLES-CHAT-8, as `files-read`); the lane and task runs are not clamped. A Fledge plugin command named `run`, `lanes-list`,
`lanes-validate` or `lanes-run` SHALL be skipped by the Fledge plugin load
with a reason (REQ-plugins-112) and the builtin SHALL keep the name. No new
slash command, env var or config key.

Acceptance Criteria
- After `loadBuiltins()`, `fledge-lanes-list` and `fledge-lanes-validate` are listed with dangerous=false, mutating=false, minTier=0 and `fledge-lanes-run` and `fledge-run` with dangerous=true, mutating=true, minTier=2, origin builtin.
- `buildOpenAiTools`: tool tier offers the two reads and not the runs; code tier offers the runs only with dangerous tools; a non-ADMIN session gets the reads and never the runs; read tier gets nothing.
- With a fake fledge, `fledge-lanes-list` runs `--non-interactive lanes list --json` in the project root and returns `{count, lanes}` typed, control characters cleaned; any arg is a usage error and nothing is spawned; a fledge error (no fledge.toml) or non-JSON output is ok=false with the reason.
- `fledge-lanes-validate` runs `lanes validate --json` (`--strict` passed through); valid lanes are ok with `{valid:true, laneCount, errors:[], warnings:[]}`; lanes with errors are ok=false, exit 1, with each error and warning and without fledge's path; a path or any other arg is a usage error and nothing is spawned.
- Non-interactive with an empty allowlist `fledge-lanes-run` and `fledge-run` are denied (exit 2, SAFE-1) and fledge never starts; allowlisted, `fledge-lanes-run verify` runs `--non-interactive lanes run verify` in the project root with no GitHub / Discord / LLM / audit / acting keys, no CDPATH / OLDPWD, `FLEDGE_NON_INTERACTIVE=1`, `CORVIDINHO_PROJECT_ROOT` = the root and other keys kept.
- `fledge-run` with `["test","--bail","a b","$(id)","--","; rm -rf /"]` reaches fledge as `run test -- --bail "a b" "$(id)" -- "; rm -rf /"` word for word; with only a task name no `--` is added.
- Lane or task names `--init`, `-l`, `--list`, `--lang`, `--dry-run`, `a b`, `../x`, `x/y` and empty, and extra `fledge-lanes-run` args, are usage errors and fledge never starts.
- A lane or task exiting 3 returns ok=false, exitCode 3 with fledge's output; a `sk-ant-…` key in the output is redacted; a run past a 200 ms timeout returns 124; an aborted calling run returns 130.
- With no fledge on an absolute PATH entry each command returns ok=false, exit 127 `<name>: fledge not on PATH`; a relative PATH entry that leads to a fledge is not used.
- A discovered Fledge plugin with commands `run`, `lanes-list` and `hello` registers only `fledge-hello`; `fledge-run` and `fledge-lanes-list` are skipped with `name already registered by builtin` and `plugins list` prints the skip line.
- `fledge.toml`, a `.fledge/lanes/*.toml` file or the `.fledge/lanes` dir linked outside the project, `fledge.toml` linked to `.env`, a `.fledge/lanes/.env.toml` and a `fledge.toml` directory are each refused by both reads (exit 2, `refused: <name>: <relative path> …`, neither the file's contents nor the link target in the result) and fledge never starts; links that stay inside the project, a non-`.toml` entry linked outside and a missing `fledge.toml` still reach fledge; the lane and task runs are not clamped.
- Where fledge is installed: a real project's lanes are listed, validated (a lane naming an undefined task is reported) and run, `fledge-run pwd` prints the project root, an unknown task is ok=false with fledge's error, a `.fledge/lanes/y.toml` linked to a file outside the project is refused by both reads without its contents in the result, and `corvidinho plugins run fledge-lanes-list --json` in this repo lists the `verify` lane.

### REQ-plugins-065

The plugin layer SHALL gate every mutating plugin by the acting role —
owner, team or community (IDENTITY-8..12, #65) — resolved at every call by
`resolveActingRole(env)` (`src/plugins/roles.ts`), never from the prompt:
`null` outside a role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: local CLI,
no role gate); `owner` when the ADMIN re-check passes (`resolveActingIsAdmin`:
bridge bit + configured owner, not muted or deny-listed — IDENTITY-9, as
ROLES-CHAT-4); `team` only when the spawning surface allows it
(`CORVIDINHO_ACTING_ROLE` is `team`, or `owner` for a caller no longer the
owner; with no stamp the ADMIN bit alone caps at owner, `actingRoleCap`) AND
the acting Discord user id, matched in the owner's people list re-read now
(`loadDeclaredPeople` + `resolvePerson`, stable ids only), is a person whose
role is team, not muted (`DISCORD_MUTED_USER_IDS`) and not on
`[discord].deny_users`; else `community` — undeclared, declared community or
without a role, WATCH / schedules / workers (community stamp or no actor), and
any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`); for community none (IDENTITY-10/11).
`runPlugin` SHALL refuse a mutating plugin the role does not allow with the
existing `Denied: plugin "<name>" is not allowed for your role
(ROLES-CHAT-3).` (exit 2) before SAFE-1, the audit row or the handler; SAFE-1,
SAFE-2, SAFE-5 and the memory ACL (forget / override stay owner-only,
REQ-plugins-011) still apply to whatever the role allows. A team review is
feedback: `github-pr-review` SHALL refuse `--event APPROVE` and
`REQUEST_CHANGES` with the role refusal (exit 2, naming IDENTITY-10) unless
the role, re-resolved at that call, is owner or there is no role session, so
a team member never gets an approval that counts toward, or a review that
blocks, a merge. In a team `/work` run `files-write` and `files-edit` SHALL
refuse a secret-looking path (`isSecretPath`, as named or as resolved; exit
2, ROLES-CHAT-8) like the read tools, so an edit is never a read oracle for a
secret file; the owner and the local CLI keep it.
`checkRepoGateForActingRole(repo, { write })` SHALL keep deny lists first,
then: team reads pass on a GITHUB-6-allowlisted repo or a confirmed-public one;
team writes (`write: true`, passed by `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`) pass only on an
allowlisted repo; community reads keep the confirmed-public path
(ROLES-CHAT-8) and community writes are refused; owner and `null` keep the
GITHUB-6 allowlist. Secret-path hiding (REQ-plugins-267) keeps treating team
like community. No new table, column or schema version; the two env keys are
internal, set only by the Discord spawn client.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.

Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review tools (plus the work tools with the work flag) of the mutating plugins for team, none for community.
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).

### REQ-plugins-066

Community site / roadmap readers (ROLES-CHAT-8.a). Corvidinho SHALL register
two read-only GitHub commands (`dangerous: false`, `minTier: 0`, Octokit,
never shell `gh`) in `plugins/github/public-docs.ts`, both behind the acting
role's `--repo` gate (`checkRepoGateForActingRole`: deny wins; community ⇒
confirmed public; team ⇒ allowlisted or public; owner / CLI ⇒ GITHUB-6):
`github-docs-read` reads one doc on the default branch — the README (default,
`repos.getReadme`), a root `README*` / `STATUS*` / `CHANGELOG*` file, or
anything under `docs/` (a directory lists its `docs/` entries, at most 200) —
and SHALL refuse any other path (`publicDocPath`: no `..`, `.` or empty
segments, no backslashes) with exit 2 before GitHub is called, for every role;
a non-owner role session SHALL also refuse a secret-looking doc path
(`isSecretPath`, exit 2, ROLES-CHAT-8) and never list one; text is SAFE-6
scrubbed, capped at 64 KiB with a truncation flag, labelled
untrusted; a non-file or binary entry is refused. `github-milestone-list`
lists milestones (`issues.listMilestones`, `--state open|closed|all`,
`--limit` 1–100) with number, title, state, a ≤500-char scrubbed description,
due date and open / closed issue counts. Issues stay `github-issue-list`.
`web-fetch` stays dangerous, so no site URL is a community source.

Acceptance Criteria
- `publicDocPath` accepts README / STATUS / CHANGELOG at the root (any case, optional extension) and `docs` / `docs/**`; it refuses source files, `.env`, `..`, nested READMEs, backslashes and empty segments.
- In a community session with a public repo, README, `STATUS.md` and a `docs/` file are read (secrets scrubbed, untrusted note), a `docs/` directory lists its entries, a doc over 64 KiB is truncated and a binary doc is refused.
- Any other path is refused with exit 2 and no GitHub call, also from the CLI; a private, unconfirmed or denied repo is refused before any read.
- A community session refuses `docs/.env.example`, `docs/deploy.pem`, `docs/.ssh/…` and `docs/keystore/…` with exit 2 and no GitHub call, and a `docs/` listing leaves them out; the owner reads and lists them.
- Milestones map state, due date, counts and a 500-char description; `--state` / `--limit` reach the API; bad flags are refused.
- The community catalog offers both readers and `github-issue-list` and never `web-fetch`, even allowlisted.
- Regression tests in `tests/github.public-docs.test.ts` fail on the base sources and pass after.
### REQ-plugins-493

In a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN` set and the acting
user not the admin owner), the GitHub repo gate (`checkRepoGateForActingRole`,
used by the GitHub plugins and review reads) SHALL admit a repo only when its
visibility is confirmed public (ROLES-CHAT-8), after the deny lists. Without
an injected lookup it SHALL ask GitHub through the Octokit visibility lookup
(`createOctokitVisibilityLookup`, token from `GITHUB_TOKEN` / `GH_TOKEN`). A
private repo SHALL be refused with the ROLES-CHAT-8 private-repo error, and a
repo whose visibility cannot be confirmed (not found, an API error, or no
token) SHALL be refused as unconfirmed (fail closed); in both cases the plugin
SHALL make no further GitHub call for that repo. ADMIN and non-role sessions
keep the GITHUB-6 allowlist gate. No env var, flag, config key or command is
added.
In a scheduled run and its `delegate` / `council` workers (`isScheduleRunEnv`,
REQ-plugins-496) a repo off the GITHUB-6 allowlist SHALL be refused before any
visibility lookup, even when it is public (DISCORD-SCHEDULE-3.a); only an
allowlisted repo then takes the confirmed-public path above.

Acceptance Criteria
- A community session with no injected lookup and GitHub answering `private: true` for the repo is refused with "private GitHub repos" by `checkRepoGateForActingRole` and by `github-pr-list` (exit 3), and no pulls request is sent.
- GitHub answering 404, or no GitHub token (no request sent), is refused with "could not confirm the repo is public".
- GitHub answering `private: false` passes the gate and `github-pr-list` sends its pulls request.
- Fixture tests stub `fetch` (Octokit's transport); no live token or network. The private-repo test fails when the lookup always answers public.
- In a scheduled run a public repo off the allowlist is refused and no visibility request is sent; a community chat (`sess_*`) keeps the public path (`tests/github.schedule-repo-gate.test.ts`).

### REQ-plugins-071

Plugins and untrusted text (SAFE-11 / SAFE-12, #71). `discord-user-lookup`
SHALL clean every member name it returns — username, global name, nickname
and the display name built from them — with `cleanDisplayName`
(`src/agent/untrusted.ts`) before the result reaches the model or the
message line; a name that is only a role word is dropped (the username, else
the id, stands in). A lookup names a Discord account; it never makes anyone a
declared person or gives a role. `web-fetch`'s `fenceUntrusted` SHALL be the
shared `fenceUntrustedData` with the `UNTRUSTED_WEB_CONTENT` word and its
existing header, so page text also loses bidi, zero-width, BOM, soft hyphen
and tag characters and a page line that imitates a Corvidinho context block is
marked `(quoted)`; everything REQ-plugins-111 requires of the fence still
holds. `delegate` and `council` SHALL pass a worker's validated
`result.injection` (SAFE-13: one of the worker's own tool results looked like
an injection; `injectionNoticeFromUnknown`, tool name and known reason ids
only) back as `data.injection` — `runDelegateChild` reads it into
`DelegateChildOutcome.injection` and `runCouncil` keeps the first voice's or
chair's on `CouncilOutcome.injection` — so the lead's tool loop takes it as
its own hit (REQ-agent-071). What a plugin may run SHALL be decided only by the acting role resolved
in the tool layer (`resolveActingRole`, REQ-plugins-065): text in a task, a
body or a tool result that claims the owner's identity widens nothing. No env
var, config key or flag.

Acceptance Criteria
- `lookupGuildMemberById` over a stubbed fetch returns the nickname, global name and display name cleaned (no mention markup, zero-width or bidi characters, role tags or labels) and a message line without `<@`.
- A community role session whose task claims the owner and asks for `files-write` is offered no mutating plugin and the call is refused with `not allowed for your role`; nothing is written.
- `tests/web.fetch.test.ts` passes unchanged on the shared fence.
- `delegate` over a fake worker whose result frame carries `injection` returns `data.injection` with the tool and known reason ids only, and none for an invalid notice; `runCouncil` keeps the first voice's notice on its outcome.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.


### REQ-plugins-101

Memory plugins by person and project, private to the person and the owner
(MEMORY-5..7, MEMORY-ACL-6, #101). Whose memory a call reads and writes SHALL
be the acting Discord id (bridge env only, REQ-plugins-011) matched in the
owner's people list re-read at the call (`loadPeopleForMemory`,
`memorySubjectFor`): a declared person's `person:<id>` profile (reading
also the rows under their linked Discord ids from before they were
declared), else the Discord id as before (MEMORY-ACL-1). `memory-store`
SHALL accept the profile categories `project`, `preference`,
`decision`, `ask`, `approval` (MEMORY-5) and `private` (MEMORY-7), and
SHALL refuse `--person` (it writes only the acting person's own memory).
`memory-profile` (safe, minTier 0) SHALL show the subject's role from the
people list (IDENTITY-8; never from memory), projects, preferences, a history
of decisions, asks and approvals newest first, and counts of private and
other notes — never private note content.

`memory-recall` / `memory-profile` SHALL read someone else's memory only
with `--person <declared id | Discord id | mention>` when the handler-time
ADMIN re-check passes (the owner with the bridge bit, not muted or
deny-listed); anyone else naming anyone but themselves SHALL get the opaque
`not authorized` whether or not that person exists (MEMORY-7 /
MEMORY-ACL-2). A recall SHALL leave private notes out unless `--category
private` is asked for, and then SHALL return them only in a conversation
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` set by the bridge; never a schedule
or other run), labelled for that person and the owner only.

`--project` on `memory-store` / `memory-recall` SHALL use the run's
project scope (`projectScopeFor(cwd)`, REQ-discord-101) and SHALL be allowed
only when `resolveActingRole` is owner, team or null (the local CLI);
community (undeclared, declared community, WATCH, schedules, workers) SHALL
get the role refusal (exit 2); a project SHALL have no private notes, and
`--project` SHALL NOT combine with `--person`.

`memory-forget-me` (safe, minTier 0, not mutating, so every role may call
it) SHALL take no arguments and record a forget request for the acting
subject (`ForgetRequestStore.request`, one pending per subject; a repeat
returns the open one) with the conversation it came from; it SHALL refuse
with no acting user, outside a conversation, and when no owner is configured
(IDENTITY-3); it SHALL write SAFE-5 `memory-forget-request` rows (`started`
first, refusing when that cannot be written, then `ok` / `error`) and SHALL
delete nothing: forgetting happens only on the owner's Approve
(REQ-discord-101). `memory-forget` / `memory-override` (owner, two-phase)
are unchanged.

Acceptance Criteria
- A declared person's `memory-store` lands in `person:<id>` and every linked Discord id recalls it; rows under their Discord ids from before are read once; an undeclared user's scope is their Discord id.
- `memory-profile` shows the people list's role (a file edit changes it), projects, preferences, history newest first and a private-note count without content.
- A non-owner's `--person` (any ref, known or not) and `memory-profile --person` get `not authorized`; the owner with the bridge bit reads a person's memory and private notes; without the bit or muted, refused.
- Private notes are left out of default and query recalls, returned on `--category private` for that person or the owner in a conversation, refused in a schedule run; `memory-store --person` is refused.
- `--project` works for owner, team and the local CLI and is refused for community, undeclared and a community-stamped team member; `--project --category private` and `--project --person` are refused.
- `memory-forget-me` records one pending ask per person (audited), deletes nothing, and refuses with no actor, outside a conversation, with arguments, and with no owner.
- `tests/memory.profiles.test.ts` and `tests/discord.forget-card.test.ts` cover each and fail on the stacked base sources.

### REQ-plugins-067

Memory plugins in GitHub conversations, filed by person or project, and a
ranked search (MEMORY-8 / MEMORY-9, #67). When a run has no Discord actor
and the WATCH spawn set a GitHub commenter (`CORVIDINHO_ACTING_GITHUB_LOGIN`
/ `CORVIDINHO_ACTING_GITHUB_ID`, the thread's `CORVIDINHO_ACTING_GITHUB_REPO`;
env only, never argv, REQ-watch-067), the acting subject SHALL be the
commenter's declared person: their GitHub numeric id matched in the
owner's people list re-read at the call (`memorySubjectForGithub`, stable
ids only, IDENTITY-7; the numeric id only, never the login, IDENTITY-7.a,
REQ-discord-367 — a login alone, or with another numeric id, matches
nobody), the same `person:<id>` profile and read scopes as on Discord; the
configured owner not declared under `[people]` (recognised by `[owner]
github_id`) SHALL use their Discord-id scope. A Discord actor SHALL always win over the
GitHub keys.

For a declared commenter `memory-store` / `memory-recall` /
`memory-profile` SHALL act on their own profile as on Discord. An undeclared
commenter SHALL get community scope: `memory-store` (own or `--project`)
SHALL be refused with nothing saved, a personal `memory-recall` /
`memory-profile` SHALL be refused, and `memory-recall --project` SHALL read
the thread repo's project memory (`project:<owner/repo>` lowercased,
`projectScopeForRepo`; refused when the run names no valid repo). In every
GitHub run project memory SHALL be read-only (`memory-store --project` keeps
the role refusal), `--person` SHALL get the opaque `not authorized` for any
ref but the commenter's own, private notes SHALL be refused (the thread is
public, MEMORY-7), and `memory-forget-me` SHALL be refused (a forget request
comes from a Discord conversation, MEMORY-ACL-6). With neither a Discord
actor nor a GitHub commenter the plugins SHALL refuse as before (no acting
user), except `--project` for the local CLI. This narrows, for GitHub runs
only, REQ-plugins-101's role refusal of `--project` for WATCH to writes:
reads of the thread repo's project memory are allowed (Leif's 2026-09-28
interview, #67); every other REQ-plugins-101 rule stands (#101's change is
still active, so REQ-plugins-101 is not modified here).

`memory-recall --query` SHALL be a ranked search (`MemoryStore.recall`,
REQ-discord-067): rows holding the query or any of its terms, most relevant
first, newer first among near-equals. The `memory-recall` description SHALL
tell the model to search with `--query` and the key words before claiming it
does not know (MEMORY-9), and the `memory-store` / `memory-recall`
descriptions SHALL say how they work on GitHub.

Acceptance Criteria
- In a GitHub-shaped env a declared commenter (by numeric id, under any login) stores into `person:<id>`, recalls with a plain-words `--query` and reads `memory-profile`; the same rows are read from Discord; the `[owner] github_id` recalls the owner's Discord-id memory and the `[owner]` login alone recalls nothing.
- On GitHub private notes, `memory-forget-me` and `--person` (any other ref) are refused and another person's rows never show; a login whose numeric id differs, or with no id, saves nothing.
- An undeclared commenter saves nothing (own or `--project`), has no personal recall and reads only the thread repo's project memory with `--project`.
- A Discord actor wins over stale GitHub keys.
- `tests/memory.recall-github.test.ts` covers each and fails on the stacked base sources.

### REQ-plugins-1016

`memory-forget-me` in a GitHub WATCH run (no Discord actor, a GitHub
commenter set by the poller) SHALL keep refusing and record nothing, and its
refusal SHALL name the path that works there (MEMORY-ACL-6.a, #101): a comment
that @mentions the watch user and says just "forget me", which the WATCH
poller records for the owner's Approve/Deny card (REQ-watch-1016).

Acceptance Criteria
- With the GitHub commenter env set, `memory-forget-me` fails with an error naming `says just "forget me"` and MEMORY-ACL-6.a, and `forget_requests` stays empty.
- `tests/watch.forget-me.test.ts` covers it and fails on main.
### REQ-plugins-710

Private notes, profile reads and the owner's view of someone's memory are
shown only privately (MEMORY-7.a, #101). A private read is
`memory-recall --category private` (the acting person's own, or the owner's
`--person`), the owner's `memory-recall --person <someone else>` view and
`memory-profile` (own or the owner's `--person`). Where it may be shown
SHALL be decided at the call from the bridge-set env only: a GitHub run
(`CORVIDINHO_ACTING_GITHUB_*` with no Discord actor) has no private place;
no role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: the local CLI) is the
operator's own terminal; a role session with the bridge's reply channel set
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`: chat, a button pick or Answer form
resume, `/session start`, `/work`) is a Discord conversation; any other
role session (a schedule) has no private place.

In a Discord conversation a private read SHALL return `ok: true` with its
human-readable text only in the result's `privateText` (private notes and
the owner's view as a heading plus one line per row — category, key, content
up to 500 characters, id; a profile as `formatMemoryProfile`, private notes
counted only), `data` exactly `{ sentPrivately: true, what }` (`what`:
`private-notes` | `person-view` | `profile`) and `message` exactly
`SENT_PRIVATELY_MESSAGE`, so nothing the tool loop gives the model holds
it. Where there is no private place (a schedule or other run with no
conversation, a GitHub thread) the owner's `--person` view and
`memory-profile` SHALL be refused (exit 2, naming MEMORY-7.a, no content);
private notes keep their existing refusals there. The local CLI SHALL show
them as before (no `privateText`). Everything else is unchanged: the acting
person's own non-private recall, `--project`, the ACL (`--person`
owner-only, opaque refusal), and the refusals of REQ-plugins-067 /
REQ-plugins-101. This narrows REQ-plugins-067 (a declared GitHub commenter's
`memory-profile` is now refused: a GitHub thread is public) and
REQ-plugins-101 (private notes and the owner's view in a conversation are
returned privately, not to the model); every other rule of both stands.

`PluginHandlerResult.privateText` (`src/plugins/types.ts`) SHALL be kept
off `data` and `message`. The `memory-recall` and `memory-profile`
descriptions SHALL tell the model that these reads go to the person who asked
by direct message, that it gets only a "sent privately" result, and to tell
them to check their DMs; `memory-profile` SHALL say it is refused on GitHub
and in schedules.

Acceptance Criteria
- In a Discord-conversation env, own private notes, own profile, the owner's `--person` recall (by id or Discord id), the owner's `--person` private notes and `--person` profile each return the content only in `privateText`, with `data` = `{ sentPrivately: true, what }` and the placeholder `message`; the person's own non-private recall still returns rows.
- In a schedule env the owner's `--person` view and profile and a person's own profile are refused (MEMORY-7.a) with no content; in a GitHub env a declared commenter's `memory-profile` is refused with no content, while their everyday recall still works.
- With no role session (the local CLI) a profile is shown inline with no `privateText`.
- `tests/memory.private-view.test.ts` covers each and fails on main; `tests/memory.profiles.test.ts` and `tests/memory.recall-github.test.ts` are updated to the private delivery.
### REQ-plugins-494

`shell-exec` SHALL refuse SAFE-21 foot-guns before it spawns anything, and
SHALL say why. Each refusal SHALL return ok=false, exit 2, `data.refused`
true with `rule: "SAFE-21"`, its `family` (`download`, `delete`, `secret`,
`edit`) and the in-root `script` it was found in (null for the typed
command), and the message
`shell-exec refused (SAFE-21): <why>[ (in SCRIPT)]; <what to do instead>`.
The check (`firstFootgun`, `plugins/shell/footguns.ts`) SHALL run before the
SAFE-3 clamp (REQ-plugins-087) and SHALL read every simple command over the
same ground as the clamp, through one walker (`forEachSimpleCommand`,
`plugins/shell/clamp.ts`): the dash and bash readings, `eval` / `trap` /
shell `-c` strings, command substitutions, the here-docs and here-strings a
shell reads, and the in-root scripts the command runs in a shell (sourced,
handed to a shell, or run by path), in the clamp's order, so for a command
the clamp accepts it reads exactly what the clamp reads. Each command comes
with the commands piped into it (`|`, `|&`) and the dirs the shell may be in
(the root and every in-root `cd` / `env -C` target anywhere in the command,
so a loop or a later `cd` is covered). What the clamp cannot read is left to
the clamp, which refuses it. The families are
checked most serious first:

- download: a downloader (`curl`, `wget`, `wget2`, `fetch`, `aria2c`,
  `http`, `https`, `xh`, `xhs`, `curlie`, also behind exec wrappers) whose
  output is run as code — piped into a shell (`sh bash dash zsh ksh mksh ash
  yash posh`), an interpreter (`python`, `python2`, `python3`, `pypy`,
  `pypy3`, `perl`, `ruby`, `node`, `nodejs`, `php`, `lua`) or `.` / `source`
  that reads its code from standard input, also through `env`, `timeout`,
  `sudo` or `doas`, and any shell or interpreter behind `xargs`; a shell fed
  a download whatever its code is (its `-c` string can hand that input on);
  a file the same command's downloader names run by path (`curl -O …/i.sh;
  ./i.sh`); a shell,
  interpreter, `eval` or `.` whose code is an expanded string, a `<(…)`
  process substitution or an expanded here-doc / here-string while the
  command runs a downloader; or a script file the same command's downloader
  names (`curl -o i.sh … && sh i.sh`, or the last component of a URL it
  fetches: `wget https://…/install.sh && sh install.sh`). A download used as
  data (piped into `jq`, or into an interpreter running a literal `-c`
  program) is not refused.
- delete: `rm`, `rmdir`, `unlink`, `shred`, `mv` (every operand, a `-t`
  directory included), `find` with `-delete` or with `-exec` / `-execdir` /
  `-ok` / `-okdir` running one of those (its start paths), `ln -f` (its
  destination) and `git worktree remove|move` (its paths), when a target
  lands outside the worktree as written or through a symlink that exists,
  or is the worktree's own directory (a `find` start path may be the
  worktree itself). A target fails closed when it expands (`$`, backtick,
  brace), starts with `~`, or is a glob with a `..` component, a glob before
  its last component, a last component that can match `.` or `..`, or (for
  `shred`, which follows links) any glob. Also refused: `find -L` /
  `-follow` with `-delete` or a deleting `-exec` (it walks into symlinked
  dirs, so its deletes can land outside whatever its start paths are);
  `rsync` with `--delete*` / `--del` / `--remove-source-files` whose
  operands land outside; those
  commands behind `xargs` (their targets come from input), `rmdir -p` of an
  absolute path or one with `..`, `git worktree prune`, and `git clean|rm|
  mv|worktree|reset|checkout|restore|switch|stash` under a `-C`,
  `--work-tree` or `--git-dir` outside the worktree or that expands.
- secret: a word, the path after its first or last `:` / `=` (`HEAD:.env`,
  `--env-file=.env`) or a redirection target that `isSecretPath` matches
  (unchanged, ROLES-CHAT-8) or that is `/proc/<pid>/environ` (also
  `task/<tid>/environ`, `$PPID`); a path that — with `~`, `$HOME` and set env
  vars expanded, from every dir the shell may be in, as written and through
  symlinks — is or is inside a host secret place: the `CORVIDINHO_ENV_FILE`
  and the allowlist file (`resolveAllowlistPath`), the `corvidinho`, `gh` and
  `git` dirs under `~/.config` and `$XDG_CONFIG_HOME`, `GH_CONFIG_DIR`,
  `~/.git-credentials`, `~/.gitconfig`, `~/.netrc`, `~/_netrc` and `~/.ssh`;
  a path that holds one when the command reads trees (`tar`, `zip`, `7z`,
  `rsync`, `find`, `rg`, `ag`, `ack`, `fd`, `grep -r`, `cp -r|-a`,
  `scp -r`) or through a glob's literal prefix; a glob that matches, when
  checked, a path `isSecretPath` matches (`cat .en*` is `cat .env`); a
  wrapper that starts its command with an env of its own instead of the
  credential-free one (`env -i` / `-` / `--ignore-environment`, `exec -c`,
  `sudo`, `doas`, `su`, `runuser`, `pkexec`; SAFE-21.a); `ps` with a BSD
  `e` option (other processes' environments); a `$VAR` / `${VAR}` of a
  verify-dropped key or a credential key (REQ-plugins-495); a word naming a
  credential key (`NAME=…`, `unset NAME`, `env -u NAME`), which would point
  git or gh back at credentials; `gh auth token|git-credential|login|refresh|
  setup-git|switch` and `gh auth status -t|--show-token`; `git credential`
  and `git credential-*`; `git -c` of a `credential`, `include`, `includeIf`,
  `url.`, `core.sshCommand`, `core.askPass` or `http.*extraHeader` key,
  `--config-env`, and `git config` of such a key; and the ssh family (`ssh`,
  `scp`, `sftp`, `ssh-add`, `ssh-agent`, `ssh-copy-id`, `sshfs`, `autossh`,
  `mosh`, `rsync` to a remote or with `-e`), which uses the owner's ssh keys.
- edit, in the typed command text only (its `eval` / `-c` strings,
  substitutions and the here-docs a shell reads included; a project script's
  own redirections are a stated residual): `sed` / `gsed` with `-i`, an
  option cluster holding `i` (`-ni`, `-i.bak`) or `--in-place[=SUFFIX]` (or
  an abbreviation), also behind wrappers and `find -exec`; the same in-place
  edit by `perl -i` / `ruby -i` (a cluster holding `i`) and `awk` / `gawk`
  / `mawk -i inplace`; `tee` / `sponge` with a file operand other than
  `/dev/null`, `/dev/stdout`, `/dev/stderr` (a `>` spelled as a command);
  and every output
  redirection (`>`, `>>`, `>|`, `&>`, `&>>`, `>&`, `<>`) whose target is not
  `/dev/null`, `/dev/stdout`, `/dev/stderr` or an fd dup (`>&N`, `N>&M`,
  `>&-`), an expanded target included. The reason points to files-write and
  files-edit.

No env var, config key, flag or slash command is added, and `isSecretPath`
is unchanged.

Acceptance Criteria
- End to end each of these refuses with exit 2, `refused` / `rule: "SAFE-21"` / its family, a message that starts `shell-exec refused (SAFE-21): ` and gives a reason and, after `; `, what to do instead, and never runs its leading `touch spawned`: `sed -i`, `sed -ni.bak`, `sed --in-place`, `find … -exec sed -i … {} +`, `echo hi > f.txt`, `>> f.txt`, `>& f.txt`, `cat <<EOF > new.txt`, `echo $(echo hi > f.txt)`, `sh -c 'echo hi > f.txt'` (edit); `curl … | sh`, `curl … | sudo bash`, `wget -qO- … | python3`, `curl … | env sh`, `curl … | timeout 5 bash -s`, `curl … | xargs sh -c …`, `sh -c "$(curl …)"`, `eval "$(curl …)"`, `bash <(curl …)`, `. <(curl …)`, `curl -o i.sh … && sh i.sh`, `wget https://…/install.sh && sh install.sh` (download); `rm -rf OUTSIDE/victim`, `rm -f OUTSIDE/*`, `rm -rf ../sibling`, `rm -rf ~/x`, `rm -rf "$TMPDIR/x"`, `unlink`, `shred -u`, `find OUTSIDE -delete`, `find OUTSIDE -exec rm {} \;`, `find . … | xargs rm`, `mv OUTSIDE/victim .`, `rm -rf .*`, `rm -rf .`, `git worktree remove ../sibling`, `git worktree prune`, `rm -rf link-out/victim` through an in-root symlink to outside, and `for i in 1 2; do rm -rf up2/victim; cd sub; done` with `sub/up2` pointing outside (delete; the victims still exist); `cat .env`, `git show HEAD:.env`, `cat ~/.config/corvidinho/env`, `cat $CORVIDINHO_ENV_FILE`, `cat ~/.netrc`, `cat $HOME/.git-credentials`, `cat ~/.config/gh/hosts.yml`, `ls ~/.ssh`, `cat /proc/self/environ`, `cat /proc/$PPID/environ`, `grep -r token ~`, `gh auth token`, `git credential fill`, `echo $GH_TOKEN`, `GIT_SSH_COMMAND=ssh git push`, `git -c credential.helper=store push`, `ssh -T git@github.com` (secret); `echo hi | tee f.txt`, `tee -a`, `| sponge f.txt`, `perl -pi -e …`, `perl -i.bak`, `ruby -i`, `awk -i inplace` (edit); `curl … | sh -c 'python3'`, `curl … | bash -c 'cat | sh'`, `curl -O …/i.sh; chmod +x i.sh; ./i.sh` (download); `find -L . -delete` and `find . -follow -type f -exec rm {} \;` with an in-root link to outside, `rsync -a --delete sub/ OUTSIDE/` (delete; the victim still exists); `cat .en*` and `cat .e?v` with an in-root `.env`, `env -i git …`, `env - git …`, `env --ignore-environment gh …`, `sudo -u nobody gh …`, `ps eww` (secret).
- In-root scripts run with `sh` are read too: `sh dl.sh` (`curl … | sh`), `sh del.sh` (`rm -rf OUTSIDE/victim`) and `sh sec.sh` (`cat ~/.netrc`) refuse naming the script, and the script's first line `touch spawned` never runs; `sh edit.sh`, whose own `echo … > file` is the stated residual, runs.
- Still allowed: `echo shown 2>&1; echo hidden >/dev/null; echo err >&2; ls 2>/dev/null 1>&2`, `>/dev/stdout`, `2>/dev/stderr`, `&>/dev/null`, `exec 3>&-`; `rm -rf build && rm -f *.o && find . -name f.txt -delete`; `cat README.md && grep -r text .`; a download used as data (`curl … | jq .`, `curl … | python3 -c '…sys.stdin…'`, `curl … | python3 -c 'd = {}; print(d)'`, `curl -o x.json … && cat x.json`); `echo x | tee /dev/null`, `echo x | tee`, `perl -pe …` (no `-i`), `find . -name '*.o' -delete`, `cat *.md`, `ls -la`, `ps aux`, `env -u FOO printenv PATH`.

### REQ-plugins-495

The `shell-exec` child and the language runners' children (REQ-plugins-313)
SHALL start without the owner's GitHub or git credentials (SAFE-21.a), from
one env builder (`runnerChildEnv` → `withoutGitCredentials`,
`plugins/runners/commands.ts`): the verify lane's scrub (`buildVerifyEnv`:
no Discord config, GitHub tokens, audit key, acting identity or LLM keys)
minus `CDPATH` / `OLDPWD` and minus every credential key
(`isCredentialEnvKey`: `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`,
`GITHUB_ENTERPRISE_TOKEN`, any `GH_*` / `GITHUB_*` key naming a token, PAT,
password or secret, `GH_CONFIG_DIR`, `GIT_ASKPASS`, `SSH_ASKPASS`,
`SSH_ASKPASS_REQUIRE`, `SSH_AUTH_SOCK`, `GIT_SSH`, `GIT_SSH_COMMAND`,
`GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`,
`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`,
`GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_TERMINAL_PROMPT`), then
with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` (no global or
system git config, where credential helpers and URL rewrites live),
`GIT_CONFIG_COUNT=3` with empty command-line values for
`credential.helper`, `http.extraHeader` and
`http.https://github.com/.extraHeader` (`GIT_CONFIG_KEY_<n>` /
`GIT_CONFIG_VALUE_<n>`, n = 0..2: an empty value resets a repo's own
helpers and stored extra headers, such as an `Authorization` header), `GIT_TERMINAL_PROMPT=0`, a `GIT_SSH_COMMAND` that reads no ssh
config and offers no key or agent (`ssh -F /dev/null -o
IdentityFile=/dev/null -o IdentitiesOnly=yes -o IdentityAgent=none -o
BatchMode=yes`), a `GH_CONFIG_DIR` that is an empty dir private to the
process (gh is logged out), `CARGO_NET_GIT_FETCH_WITH_CLI=true` (cargo
fetches git dependencies with that git) and `CORVIDINHO_PROJECT_ROOT`.
Pushes, PRs and merges then happen only through the checked GitHub tools.

`shell-exec` SHALL spawn through `spawnCapped` (`plugins/fledge/spawn.ts`)
with that env, the calling run's abort signal, the runners' timeout (10
minutes, exit 124) and per-stream output cap (64 KiB, with a truncation
note), stdin closed, in its own process group, killed on timeout or abort
(exit 130); a shell that cannot start SHALL return exit 127, and the output
SHALL be secret-scrubbed (SAFE-6): vendor-key shapes (`scrubSecrets`) and
the literal value of every set secret env var (`redactSecretEnvValues`).

The SAFE-3 clamp (REQ-plugins-087) SHALL also:
- check the directory of `env -C DIR` / `-CDIR` / `--chdir[=]DIR` (in an
  option cluster such as `-iC`, or abbreviated such as `--ch`) and of
  `sudo -D` / `-R` / `--chdir` / `--chroot` like a `cd` target, wherever the
  wrapper sits in the command (behind other wrappers or `find -exec`), and
  look for the wrapped command's scripts from that dir;
- refuse a wrapper whose command it cannot read (`env -S` /
  `--split-string`, `sudo -s` / `-i` / `--shell` / `--login` with a
  command), and read `sudo` and `doas` as exec wrappers;
- check each `cd` / `pushd` / `env -C` target from the root and every dir
  the shell may be in both as written and as the kernel walks it (an
  existing symlink followed, a `..` after it taken from the link's target),
  refusing one that lands outside the real root or cannot be walked (a
  dangling or looping link);
- refuse an `ln` (symbolic or hard) whose target leads out of the root (a
  symbolic link's relative target read from the directory the link is made
  in), expands or starts with `~`.

The refusal names `cd/pushd/env -C or a symlink` and the target with its
option (`/ (env -C)`, `/ (sudo -D)`, `/ (ln target)`).

Acceptance Criteria
- `printenv` in `shell-exec` shows no `OPENAI_API_KEY`, `DISCORD_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `GIT_ASKPASS` or `SSH_AUTH_SOCK` set in the bot's env, shows `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, a key-less `GIT_SSH_COMMAND`, and a `GH_CONFIG_DIR` outside the owner's home with no `hosts.yml`.
- With a credential helper (a marker-writing script) in the owner's `~/.gitconfig` and in the repo's own config, `shell-exec` running `git ls-remote` against a local HTTP server that answers 401 fails and the helper never runs.
- The node runner's child env (a stub that prints `env`) drops `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, inherited `GIT_CONFIG_KEY_1` / `GIT_CONFIG_VALUE_1` / `GIT_CONFIG_PARAMETERS` and an inherited `GH_CONFIG_DIR`, and sets the values above plus `GIT_CONFIG_COUNT=3`, `GIT_CONFIG_KEY_0=credential.helper`, `GIT_CONFIG_KEY_1=http.extraHeader`, `GIT_CONFIG_KEY_2=http.https://github.com/.extraHeader`, empty `GIT_CONFIG_VALUE_0..2` (no inherited `store` value) and `CARGO_NET_GIT_FETCH_WITH_CLI=true`.
- An aborted calling run stops `shell-exec` running `sleep 60` with exit 130 well before the sleep ends; 200000 bytes of output come back truncated (under 80000 characters, `truncated: true`); a `ghp_…` token printed by the command is scrubbed, and so is the literal value of a set `DISCORD_TOKEN` with no vendor shape.
- `firstDisallowedCd` refuses `env -C / ls` (`/ (env -C)`), `env --chdir=/ ls`, `env --chdir /etc sh -c pwd`, `env -iC/ ls`, `env --ch=.. ls`, `env -C up ls` (up → /), `env -C $D ls`, `sudo -D / ls`, `find . -exec env -C / ls \;` and `env -S '…'`; allows `env -C sub ls` and `env -C sub ./x.sh`.
- With in-root `up → /`, `sub/out → OUTSIDE` and `insub → sub`: `cd up && ls`, `pushd up`, `cd up/etc`, `cd sub && cd out` and `cd nothere/../up` refuse; `cd insub && cd deep` and `cd sub/deep/../..` stay allowed.
- `ln -s / x && cd x` (`/ (ln target)`), `ln -sfn /etc cfg`, `ln -s ../../x sub/l`, `ln /etc/hosts h` and `ln -s $T x` refuse; `ln -s ../sub sub/again` and `ln -s sub l` stay allowed.
- End to end `env -C / pwd`, `env --chdir=/ pwd`, `cd up && pwd`, `cd sub/out && pwd` and `ln -s / x && cd x && pwd` return exit 2 with SAFE-3 and spawn nothing (no marker, no `x`); `env -C sub pwd && cd insub && pwd` runs and prints the in-root `sub`.

### REQ-plugins-496

Scheduled runs SHALL read and act only on GitHub-allowlisted repos, even
public ones (DISCORD-SCHEDULE-3.a). `src/plugins/roles.ts` SHALL export
`SCHEDULE_SESSION_PREFIX` (`"schedule_"`) and `isScheduleRunEnv(env)`, true
exactly when `CORVIDINHO_DISCORD_SESSION_ID` starts with the prefix; the
scheduler SHALL build every run's session id as the prefix plus the schedule
id, and `delegate` / `council` workers SHALL keep that key (the worker env
drops only `DISCORD_*`, `CORVIDINHO_ACTING_*` and the token keys), so a
worker of a scheduled run is one too. In such an env
`checkRepoGateForActingRole` SHALL, after the deny lists and before the role
rules, refuse a repo that fails `checkGithubRepo` (the GITHUB-6 allowlist,
deny wins, empty allow refuses) for every role, with no visibility lookup,
and the error SHALL name DISCORD-SCHEDULE-3.a; a repo that passes SHALL still
go through the role rules (a community run's reads need a confirmed-public
repo, its writes stay refused, ROLES-CHAT-3/8). This one gate SHALL cover
every `github-*` command, `github-pr-diff` / `github-pr-files` and
`github-docs-read` / `github-milestone-list`. `web-fetch` in such an env SHALL
refuse (`blocked`, exit 2), in its shared per-hop URL rule (the first hop and
every redirect target, before DNS or any connection), a URL whose host is
`github.com`, a `*.github.com` host, `githubusercontent.com` or a
`*.githubusercontent.com` host unless it names an `OWNER/REPO` that passes
`checkGithubRepo`: only `/<owner>/<repo>/…` on `github.com`, `www.github.com`,
`codeload.github.com` and `raw.githubusercontent.com`, and
`/repos/<owner>/<repo>/…` on `api.github.com` (segments percent-decoded, a
trailing `.git` dropped, `[A-Za-z0-9._-]` only, not `.` or `..`) name one; the
allowlist SHALL be read once per call for the run's env (`tryLoadAllowlist`)
and an unreadable one SHALL refuse every GitHub hop. The refusal SHALL name
only the host, never the path. Other hosts, and runs whose session id is not
`schedule_*` (chat, `/work`, WATCH, the local CLI), SHALL be unchanged. No
env var, config key, command, table, column or schema version.

Acceptance Criteria
- `isScheduleRunEnv` is true for a `schedule_*` session id and false for `sess_*`, `work_*`, `wsess_*`, empty and unset; the scheduler's run session id is `SCHEDULE_SESSION_PREFIX` plus the schedule id; `buildDelegateSpawn` from a schedule lead (owner or community stamp, and a council voice env) keeps it.
- In a schedule env a public repo off the allowlist is refused for the owner and community stamps and for a worker env, naming DISCORD-SCHEDULE-3.a, without calling the visibility lookup; an allowlisted repo passes; a denied repo is refused; a community write on an allowlisted repo is refused (ROLES-CHAT-3) and a community read of an allowlisted private repo is refused (ROLES-CHAT-8), while the owner stamp reads it; a `sess_*` community chat still reads the public repo.
- `github-pr-list`, `github-issue-list`, `github-pr-diff`, `github-pr-files`, `github-docs-read` and `github-milestone-list` in a schedule env refuse a public off-list repo with exit 3 and send no GitHub request.
- `web-fetch` in a schedule env refuses GitHub-host URLs of an off-list repo (github.com in any case or with a trailing dot, www, api `/repos/`, codeload, raw.githubusercontent.com), gists, other GitHub hosts, GitHub paths naming no repo and a denied repo, before DNS; allowlisted repos and other hosts fetch; a redirect into raw.githubusercontent.com for an off-list repo, and an allowlisted GitHub URL redirecting off the list, are refused on that hop; an unreadable allowlist refuses GitHub hops only; outside a schedule env the same URLs fetch; the handler passes the run's env (exit 2 in a schedule env).
- Regression tests in `tests/github.schedule-repo-gate.test.ts` fail on the base sources and pass after.

### REQ-plugins-097

It asks me before touching prod or deploys (VPS, secrets, env, DNS); updating
itself to a tagged release is not a deploy (AUTONOMY-9). Any contact with prod
asks me first, read-only looks included, and every prod card needs the
one-time code (AUTONOMY-9.a). It asks before announcements it starts
(AUTONOMY-10); every channel post it makes waits for my OK, even text I
dictated and replies to me (AUTONOMY-10.a, channel-post half). Anything else
inside its guardrails, it just does and tells me (AUTONOMY-11). AUTONOMY-9,
-10 and -11 were captured on main from Leif's 2026-09-28 interview; 9.a and
10.a are captured with `hi` in this change from his 2026-09-30 round 13
decisions. The first-20 public-thread replies half of AUTONOMY-10 / 10.a is a
later change.

`runPlugin` SHALL call `mustAskGate` (`src/plugins/must-ask.ts`) for every
caller, after the ROLES-CHAT role gate and the SAFE-1 deny and before the
SAFE-5 `started` row. A call's class SHALL come only from its command's
`PluginCommand.mustAsk` (a `prod` | `public` class, or a classifier over
its args and the files and config they name); nothing the model or a message
says changes it, and a classifier that throws SHALL ask as prod. A `refuse`
verdict (the command would refuse the call anyway) SHALL be returned with no
card. For an `ask` verdict:
- a delegate or council worker (`CORVIDINHO_DELEGATE_DEPTH` > 0) SHALL be
  refused with no card; with no owner configured the call SHALL be refused at
  once (nothing could approve it);
- the same call the owner denied (same card kind and action hash — tool,
  args and target — and the same requester) SHALL be refused with no new
  card (SAFE-20); a changed call asks again and a lapse does not block;
- otherwise one `approval_requests` row SHALL be recorded: kind `mustask`,
  class destructive (Approve plus the SAFE-19 one-time code) for prod, kind
  `mustask-post`, class plain for a channel post; action `<tool>: <why>`,
  the target, the amount (`1 call (no money)` / `1 message (N characters)`),
  the exact text or command as its text, the acting user (or `local`) as
  requester, this process as waiter, `MUST_ASK_CARD_TTL_MS` (5 min) to
  answer; the run SHALL note the wait once (`setMustAskNotifier`, stderr by
  default) and wait with its abort signal;
- only an approval it consumes (`approved` → `used`) SHALL run the call; a
  deny, no answer by the expiry or a stopped run (exit 130) SHALL run nothing
  and return a refusal naming the rule, the request id and why (with no
  bridge the lapse says the bridge DMs the card); a run stopped just as the
  owner approves SHALL run nothing (the approval is left unused); every gate
  refusal SHALL append a SAFE-5 `denied` row, and the gate's notes and
  refusals SHALL be secret-scrubbed (SAFE-6).

Classes: `discord-post-message` is public for every post (the card's text is
the defanged text that would be posted; a dry run posts nothing and asks
nothing; its channel, requester-flag, token and strict checks run first and
refuse with no card). Prod: `shell-exec` when `shellProdWhy` names a reason —
over the SAFE-3 clamp's walker and every command an exec wrapper runs: the
`PROD_COMMANDS` table (ssh family; root; the box's services, packages,
containers, firewall and cron; secrets tools; cloud, hosting, cluster and
infrastructure CLIs; DNS tools), remote `rsync`, `gh` on secrets,
variables, workflows, releases (and `gh api` on those paths), `git push`
(git and gh subcommands read past global options and their values; a git
alias read from the repo's config like what it stands for, one set with
`-c alias.…` asks), `npx`-style runs of one (`bun x` included, `-c` shell
text read), package scripts (with pre/post) from package.json (`bun
<script>` included; `bun <file>` and `bun exec` text read; an install reads
the install lifecycle scripts), `make` / `just` recipes with prerequisites
and variables, inline interpreter code and in-root or `#!` scripts an
interpreter or path runs; an unreadable script or recipe, a make / just file
or dir option, a package-manager option that picks another package.json,
workspace, preload or shell, and a command named by an expansion ask; a
command SAFE-21 or the clamp refuses is left to the handler. Free text
(runner code, recipe and task text) also names SSH, cloud and secrets client
libraries (`paramiko`, `ssh2`, `awscli`, `hvac` …). Exactly
`CORVIDINHO_REF=v<X.Y.Z>` plus the installed checkout's
`scripts/corvidinho-update.sh` (or `bash` it), nothing else, for
a tag that checkout has, SHALL NOT ask (`isSelfUpdateToTag`); the updater in
any other form asks. The language runners ask on table words in argv and an
in-root script they run; `fledge-run` / `fledge-lanes-run` read the task and
lane commands from `fledge.toml` / `.fledge/lanes/*.toml` and ask for any
that do or can't be read (no fledge.toml: no ask, fledge refuses); a
discovered `fledge-<command>` asks on table words in its name or argv;
`git-push` asks for the remote's recorded default branch and for a usual
default or deploy name (`main`, `master`, `production`, `gh-pages` …)
whatever default is recorded. Every other builtin SHALL have no class and run
with no ask. No env var, config key or schema change.

Acceptance Criteria
- An approved card runs the call once after it and the request ends `used`; prod is kind `mustask` class destructive, a post kind `mustask-post` class plain with the exact text.
- A deny runs nothing and says so; the same call again is refused with no new card; a changed call asks again.
- No answer by the expiry runs nothing (`expired`), says the bridge DMs the card, and a re-send asks again.
- A delegate worker and a run with no owner are refused with no card; an aborted wait is exit 130; a throwing classifier asks as prod; each refusal is a SAFE-5 `denied` row.
- `discord-post-message` text claiming it needs no OK still raises the card; a dry run and a refused post raise none.
- The shell, runner, Fledge and git-push classifiers ask for the table commands and forms above, read-only looks included, and not for everyday commands; the tagged self-update runs with no ask and every near-miss form asks.
- `git -C . push`, `gh workflow -R o/r run`, a git alias for a push, `bun <script>` / `bun x` / `bun exec` / `bun <file>` of a prod command, `npx -c`, a prod install script and a package-manager option that picks another package.json ask; `main` pushed while `develop` is the recorded default asks.
- A run stopped just as the owner approves runs nothing; the wait line and refusals carry no secret.
- Only the must-ask builtins carry a class; every other builtin passes the gate with no card.

