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
filled, SPECSYNC-4) other than SpecSync's own lifecycle records there, and
any path component inside the project containing
`keystore` (a keystore file such as `wallet-keystore.json` or any file under a
keystore directory such as `keystore/UTC--…`). Components of the project
root's own absolute path SHALL NOT be matched against `keystore`, so a project
checked out under a keystore-named directory keeps its ordinary files
writable; nor SHALL a SpecSync change folder's name (`.specsync/changes/<id>/`,
`.specsync/archive/changes/<id>/`), which is a slug of the change title.
SpecSync's own lifecycle records in an active change folder, the `*.json`
files directly in `.specsync/changes/<id>/` (state, approvals, review,
verification; `isSddRecordPath`), SHALL be refused by `files-write`,
`files-edit` and `files-delete` (exit 2, a "SpecSync lifecycle record"
refusal naming `specsync-change-answer`): only the `specsync change` commands
write them, so a run cannot widen the paths its change covers past the
REQ-agent-518 gate, put acceptance criteria in past the REQ-plugins-518 hi
check, or write an approval or review a human owes (AGENT-18, AGENT-18.a).
They stay out of `isProtectedPath`, so git-commit still stages their
deletion when a change is archived.

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
- files-write, files-edit and files-delete of `.specsync/changes/<id>/state.json`, files-write of its `approvals.json` and of a planted `.specsync/changes/<new>/state.json` are refused (exit 2, "SpecSync lifecycle record"); the file is unchanged and nothing is created, so a planted or widened change does not cover an edit; `tasks.md` and `deltas/agent.md` in that folder are still written (`tests/agent.repo-ways.test.ts`; fails with the rule removed from the file tools).

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
(best effort). A refusal that names its reason as a fixed kebab-case code
(`PluginHandlerResult.auditDenied`, `[a-z0-9-]{1,48}`, never args or text)
SHALL instead be logged as one `denied` row whose action is
`<command>:<reason>`: from the must-ask gate (its classifier or its card; no
`started` row) or from the handler (after `started`, in place of `error`)
(GITHUB-7.a, REQ-plugins-099). Rows SHALL hold the action, actor, surface, a SHA-256 digest of
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
- A dangerous run whose handler or must-ask classifier refuses with `auditDenied: "<reason>"` appends one `denied` row under `<command>:<reason>` (after `started` for the handler) instead of `error`; a result without it is unchanged (`tests/github.self-merge.test.ts`).

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
handler unchanged when given, and an optional `review` (`PrReviewRun`: the
calling agent run's env, change authors and review call, GITHUB-9 /
REQ-agent-092), passed through the same way.

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
`verified`, `verifySkipped`, `totalTokens`, `timedOut`, `aborted` and
`models` (the worker's models, `DelegateChildOutcome.models`, GITHUB-9), so
the lead can synthesize the result (AUTONOMOUS-5). When the handler has a
`review` context, the worker SHALL be spawned with the lead's change authors
(`review.authors()`, REQ-agent-117), so a PR the worker opens is never
reviewed by a model that wrote part of it. The result SHALL be ok only when the worker exits 0 in state
`done`.

Acceptance Criteria
- `delegate` is registered with dangerous=false, mutating=true, minTier=2, autonomous=true.
- A non-ADMIN role session's `runPlugin delegate` is refused with exit 2 "not allowed for your role" and spawns nothing.
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent budget are refused with exit 2 and spawn nothing; bad args exit 1.
- Happy path against a fake bin: argv has `task run --here` (REQ-cli-122), `--non-interactive`, no `--no-verify`, the clamped `--tier`, and `--task` last with the skill / depth provenance header; env has depth 1, the worker tier, non-interactive, the lead allowlist, ADMIN 0 for a role-session lead and no confirm tokens; data carries skill / tier / depth / state / filesChanged / verified / verifySkipped.
- A failed worker yields ok=false with its exit code and a SAFE-6 scrubbed summary.
- GITHUB-9: a worker result naming its model, usage models or failovers returns them as `data.models`; with a `review` context the worker env carries the lead's authors (`CORVIDINHO_DELEGATE_AUTHORS`), without one it carries none (an inherited value is dropped).

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
answer SHALL refuse the name. The connection SHALL dial only checked IPs (the pin and dial
helpers `pinTargets` / `dialPinned` are shared with the keyed JSON GET,
REQ-plugins-3181, without changing `web-fetch`), in
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
- `plugins list` shows `web-fetch` with dangerous=true, minTier=1; the default tool catalog leaves it out, it is offered at tool/code tier only when dangerous tools are included and never at read tier; a non-interactive run that has not allowlisted it is denied (SAFE-1); `web-search` is a separate command (REQ-plugins-318) and web-fetch's own behaviour is unchanged.
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
- Against a fake bin, 3 voices make 7 worker runs. Each is `task run --here --non-interactive --tier read --output ndjson` (`--here`, REQ-cli-122) with `--task` last and no `--no-verify`. Each env has depth 1, tier read, non-interactive, an empty `CORVIDINHO_ALLOWLIST` (even when the lead allowlists dangerous tools), `CORVIDINHO_ACTING_IS_ADMIN=0`, and no GitHub / Discord token or audit key. The data carries the decision and a 7-entry transcript.
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
`DISCORD_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`BRAVE_SEARCH_API_KEY` (PLUGIN-7) and `GIPHY_API_KEY` (PLUGIN-8),
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
- The child env lacks Discord / Corvidinho LLM / audit keys, `BRAVE_SEARCH_API_KEY` and `GIPHY_API_KEY` (`tests/gif.search.test.ts`), keeps `GITHUB_TOKEN`, and has `FLEDGE_NON_INTERACTIVE=1`.
- Exit 7 → ok=false exitCode 7; sleep past a 200 ms timeout → exitCode 124; missing binary → 127.
- A timeout kills a same-group and a `setsid` grandchild, and a background grandchild left after the plugin exited; an abort returns exit 130 with `aborted` and kills the tree.
- A `ghp_…` token in plugin output is redacted and output past the cap is truncated with a marker.

### REQ-plugins-114

The system SHALL measure the context cost of each loaded plugin command on the
exact tool definition sent to the model (`toolDefForEntry`), as JSON
characters and approximate tokens (chars/4), and SHALL report the loaded tool
surface as a whole (FLEDGE-5 / PLUGIN-6): total approximate tokens if every
loaded command were offered, a default budget of ~9000 tokens (raised from
~8000 when the five SpecSync change tools of AGENT-18 / AGENT-18.a joined the
builtins) with an over-budget flag, subtotals by origin (`builtin` or
`fledge:<plugin>@<version>`), the largest schemas, and commands whose schema
exceeds a ~250-token soft cap. `PluginCommand` MAY carry an `origin`; the
registry `list()` shape is unchanged.

Acceptance Criteria
- `withToolCost` adds `origin`, `schemaChars`, `approxTokens` (= ceil(schemaChars/4)) per entry.
- `toolSurfaceReport` totals match the per-entry sum, group by origin, and flag over-budget / oversized with small test budgets.
- The text view prints per-command `~N tok`, the total vs budget with `OVER BUDGET` when exceeded, per-origin subtotals and oversized names.
- The builtins plus a discovered Fledge plugin, with the SpecSync change tools loaded, stay under the default budget (`tests/fledge.plugins.test.ts`).

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
- Several processes that each open the shared DB file and append one row, all at once, get every append in and the chain verifies also when the file is new or has a re-scrub due (their opens take turns, REQ-discord-287).

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
identity or LLM keys) without `CDPATH` / `OLDPWD` and without the owner's
GitHub or git credentials (SAFE-21.a: `withoutGitCredentials`, the env
`shell-exec` and the runners get, REQ-plugins-495; the model may be offered
the lane and task runs under SAFE-3.a, REQ-agent-503, so pushes, PRs and
merges go only through the checked GitHub tools), with
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
- With `GH_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK` and a `GH_CONFIG_DIR` holding `hosts.yml` in the env and a credential helper in `~/.gitconfig`, `fledge-run` and `fledge-lanes-run` start fledge with none of those keys, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_COUNT=3` with an empty `credential.helper`, a key-less `GIT_SSH_COMMAND` and a `GH_CONFIG_DIR` with no `hosts.yml`; `git config --get-all credential.helper` there does not show the owner's helper (`tests/fledge.core.test.ts`).
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
without a role, schedules / workers (community stamp or no actor), WATCH runs
no declared owner or team member triggered, and any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) and
`TEAM_SEARCH_TOOLS` (`web-search` and `gif-search`, PLUGIN-9: "Web search and
GIF search are for me and the team only, and stay off until I allow them,
like web-fetch"; on every team session, still SAFE-1 allowlisted and SAFE-5
audited; `web-fetch` and `discord-send-file` stay the owner's) plus, when
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
internal, set only by the Discord and WATCH spawn clients.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.


- On GitHub (IDENTITY-12.a, REQ-plugins-1201) a WATCH run (surface stamp
  `watch`) SHALL resolve owner and team from the GitHub numeric id the WATCH
  spawn stamps for the person who triggered it, never from a Discord id, with
  the same rules otherwise: the stamp only lowers the role, and anyone else
  is community.
- A WATCH run SHALL never be a `/work` task: `actingWorkTask` is false there
  whatever `CORVIDINHO_ACTING_WORK_TASK` says, so team never gets the work
  tools on GitHub.
Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review and search tools (plus the work tools with the work flag) of the mutating plugins for team, none for community; `TEAM_SEARCH_TOOLS` is exactly `web-search` and `gif-search`, and the team catalog offers both (allowlisted) while the community catalog offers neither; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler (`tests/gif.search.test.ts`).
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).
- In a WATCH env the owner's GitHub id with the owner stamp resolves owner, a team member's with the team stamp team, and a team member's run gets the review tools but not `files-edit` even with a stale work stamp (`tests/watch.github-roles.test.ts`).

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
community (undeclared, declared community, WATCH, schedules other people
create, workers; the owner's own schedule resolves owner,
DISCORD-SCHEDULE-1.a) SHALL get the role refusal (exit 2); a project
SHALL have no private notes, and `--project` SHALL NOT combine with
`--person`.

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
- In the owner's own scheduled run (owner stamp, `schedule_*` session, no reply channel) `memory-store --project` and `memory-recall --project` work, while `memory-recall --category private`, `memory-recall --person <id>` and `memory-profile` are refused with no private place to show them and no `privateText` (`tests/scheduler.owner-role.test.ts`).

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
`PluginCommand.mustAsk` (a `prod` | `public` | `merge` class, or a classifier over
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
  `mustask-post`, class plain for a channel post, kind `mustask-merge`, class
  destructive for a merge of its own PR (GITHUB-7.a, REQ-plugins-099); action
  `<tool>: <why>`, the target, the amount (`1 call (no money)` /
  `1 message (N characters)` / `1 merge (no money)`),
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
whatever default is recorded. `github-pr-merge` SHALL be class `merge`
through its classifier, which runs the whole self-merge gate first and raises
no card for a merge it would refuse (GITHUB-7.a, REQ-plugins-099). Every other
builtin SHALL have no class and run with no ask. No env var, config key or schema change.

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
- `github-pr-merge` carries the `merge` class: a merge whose gate passes raises one card of kind `mustask-merge`, class destructive (Approve plus the one-time code), titled `Merge its own PR — only when you ask (GITHUB-7.a) · from <surface>`, amount `1 merge (no money)`, target `<repo>#<n> at <head sha>` and the squash title as its text; a deny, lapse or other card refusal of it is one `denied` row named `github-pr-merge:card-<outcome>` (REQ-plugins-099).

### REQ-plugins-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). The `delegate` command SHALL pass the
worker's model failovers (`DelegateChildOutcome.modelFallback`, validated from
its result frame) back as `data.modelFallback`, and the `council` command its
voices' and chair's (`CouncilOutcome.modelFallback`, each once), finished or
not, so the lead's tool loop reports them as its own run's (`via`
`delegate` / `council`). Absent when no worker failed over. No flag, env var or
config key is added.

Acceptance Criteria
- `createCouncilCommand` with a fake bin whose result frames report one failover returns `ok` with `data.modelFallback` holding it once.
- `runDelegateChild` over a fake bin returns the worker's failovers (an invalid entry dropped), which the `delegate` data carries.

### REQ-plugins-518

SpecSync change tools (AGENT-18, captured on main; its SpecSync clause).
`specsync-change-status` (read-only, minTier 0) SHALL return
`specsync change status [id]` and refuse `--root`.
`specsync-change-new` and `specsync-change-answer` SHALL be mutating, not
dangerous, minTier 2 (code), and in `TEAM_WORK_TOOLS` (REQ-plugins-065);
each SHALL refuse a forwarded `--root` / `--root=…` (exit 1) and, when the
project's SpecSync change workflow is off (`repoWaysNow`: the working tree,
HEAD and the run's base merged with the run's start scan, REQ-agent-518),
`SDD_OFF_REFUSAL` (exit 2), before spawning anything.
`specsync-change-new` SHALL pass its args to `specsync change new`, list the
open change folders (`.specsync/changes/*/state.json` ids) before and after,
record each id its spawn added in the run's ledger (`noteOpenedChange`,
REQ-agent-519) and return them as `data.opened`.
`specsync-change-answer <id> <question> <answer…>` SHALL take a slug id (no
path, no `..`, no flag) and a question, join the remaining args into one
answer, and spawn `specsync change answer <id> <question> <answer>`. In a
repo that keeps hi criteria (REQ-agent-518) an `acceptance_criteria` answer
SHALL cite at least one hi id (`FAMILY-N[.x]` whose family `hi export`
lists; other upper-case tokens such as `SHA-256` are not citations) and
every cited id SHALL be a criterion `hi export` shows (retired ones are not):
none cited, one not captured, or `hi export` unreadable SHALL refuse (exit 2)
naming why, with nothing spawned. Other questions and repos without hi are
not checked. `specsync` and `hi` SHALL be found on the PATH in effect at the
call. `PluginCommand.agentTool?: boolean` SHALL exist: `false` keeps a
command out of the agent's tool catalog whatever the allowlist (REQ-agent-065).
No env var, config key, flag or schema.

Acceptance Criteria
- `specsync-change-new` / `-answer` are mutating, not dangerous, minTier 2, in `TEAM_WORK_TOOLS`; `specsync-change-status` is read-only at minTier 0.
- In a repo with no enabled `sdd.json`, `specsync-change-new` and `-answer` return `SDD_OFF_REFUSAL`; `--root` is refused; nothing is spawned.
- In an SDD repo `specsync-change-new "Fix the app" --kind bug-fix --path src/app.ts` spawns `specsync change new`, returns `opened: ["fix-the-app"]` and records it in the run's ledger; `specsync-change-status fix-the-app` spawns `change status`.
- In a hi repo (fake `hi export`: AGENT-18, AGENT-18.a captured, AGENT-2 retired) answers citing nothing, citing AGENT-99 or citing AGENT-2 are refused with nothing spawned; one citing AGENT-18.a spawns with the joined answer; `public_contract` and a repo without hi are not checked.
- `citedHiIds` finds `AGENT-18`, `DISCORD-SCHEDULE-1.a` and `MEMORY-7.a` and ignores `SHA-256`, `UTF-8` and `REQ-agent-518`.

### REQ-plugins-519

Own-change approve and archive (AGENT-18.a, captured in this change with
`hi` from Leif's 2026-09-28 interview, round 13). `specsync-change-approve`
and `specsync-change-finalize` SHALL be dangerous (SAFE-1 allowlist in
non-interactive runs, SAFE-5 audit), minTier 2, `agentTool: false` (never
offered to the model; `runTask` runs them, REQ-agent-519) and in
`TEAM_WORK_TOOLS`. Each SHALL refuse `--root`, a workflow that is off, a bad
id or extra args, then refuse (exit 2) with the `selfLifecycleRefusal` line,
spawning nothing, unless all hold: the run is not a delegate or council
worker (delegation depth 0), not WATCH (`CORVIDINHO_WATCH_SESSION_ID`), not a
schedule (`schedule_` session or a `watch` / `schedule` surface stamp) and
not a community role; the project is Corvidinho itself
(`isCorvidinhoProject`), else `HUMAN_LIFECYCLE_LINE` ("in this repo a human
approves, reviews and finalizes SpecSync changes"); the id is one the
current run's ledger recorded; and `runTask` is settling it right after a
green lane (the ledger's verified mark). Approve SHALL spawn
`specsync change approve <id> --actor corvid-agent`; finalize SHALL spawn
`specsync change check <id>`, `specsync change review <id> --reviewer
corvid-agent` and `specsync change finalize <id>` in that order, stopping at
the first failure with an error naming the step. `isCorvidinhoOriginUrl`
SHALL accept only github.com with the path CorvidLabs/Corvidinho (https with
or without credentials or `.git`, ssh or scp form, any case).

Acceptance Criteria
- Both are dangerous, minTier 2, `agentTool: false`, never offered even allowlisted, refused for community.
- Outside Corvidinho, even for this run's own change with the verified mark, both return `HUMAN_LIFECYCLE_LINE` and nothing is spawned.
- On Corvidinho: no run or a change this run did not open → "not a SpecSync change this run opened"; before the verified mark → "only right after the verify lane is green"; WATCH, a `schedule_` session, a `schedule` stamp, a worker and a community role are refused; with all conditions met and the tool allowlisted approve spawns `change approve c1 --actor corvid-agent`; not allowlisted is a SAFE-1 denial before the handler.
- A repo whose origin is CorvidLabs/Corvidinho but is not this checkout is not Corvidinho; the checkout and its linked worktree are; changing the origin makes it not.
- Origin URL forms: the five Corvidinho forms match; a fork name, another host, a longer path, a look-alike host and a local path do not.

### REQ-plugins-092

Before the PR, a second model reviews the diff in bounded rounds, and the PR
lists what it raised and what changed (GITHUB-9, captured on main from
Leif's 2026-09-28 interview). The reviewer is the first other model I've
configured that didn't write the change; there's no reviewer setting, and
with no second model there's no PR and the reply says why (GITHUB-9.a,
captured in this change from Leif's 2026-09-30 interview, round 13).

`github-pr-create` SHALL run `gatePrCreate` (`src/work/review.ts`) for every
caller, after the repo gate (GITHUB-6) and argument checks and, in live mode,
after its Octokit client exists, and before anything reaches GitHub; the
SAFE-1 deny, the must-ask gate and the role gate of `runPlugin` still apply
first. It SHALL open a PR only for a tree with a finished review cycle:

- **With a run model** (the handler got `review`, a `PrReviewRun`, from the
  agent tool loop, REQ-agent-092): the gate SHALL stage the work tree's
  tracked files at the handler cwd (the repository top level, `gitRoot`)
  into a copy of the index (`git add --update`; `runGit`'s `indexFile` sets a
  temporary `GIT_INDEX_FILE`; the inherited one is still stripped) and write
  its tree (`reviewTree`). The copy SHALL keep the real index's modification
  time: git re-reads a file whose size and times match its index entry only
  when the entry is not older than the index file, so a copy stamped later
  would miss a same-size edit made in the same second as the last index
  write. Tracked edits, deletions and files already staged
  count; untracked files do not (they are not what the PR carries, so a
  scratch file never holds the PR back and its content never reaches the
  reviewer); the real index and status do not change. When the latest cycle for (repo, head) ended on this
  tree, no round runs. When its open round reviewed this tree (findings,
  unchanged since), the author declined them: the cycle SHALL end
  (`declined`) and they are listed as not changed. Otherwise the next round
  (round 1 of a new cycle after a finished one) SHALL review the diff from
  the merge-base of HEAD with `--base` (`refs/remotes/origin/<base>`, else
  `refs/heads/<base>`) to the tree: the reviewer is `resolveReviewer(env,
  authors)` — the first entry of `CORVIDINHO_LLM_MODEL`, then
  `CORVIDINHO_LLM_MODEL_READ`, `_TOOL` and `_CODE` (every chain entry, each
  label once) that has its key and whose model id (whatever kind reaches it)
  is none of the authors: the run's `authors()`, every model recorded as
  having changed this checkout (`pr_change_authors`, REQ-agent-092: its top
  level on the branch checked out now, the head branch, or detached) and
  every author recorded for (repo, head). There is no reviewer setting. One no-tools completion
  (`review.complete`) SHALL carry fixed instructions and, as untrusted data
  (SAFE-12 fence), the title and the diff, secret-scrubbed (SAFE-6) and at
  most `REVIEW_DIFF_MAX_BYTES` (200 KiB, the `github-pr-diff` cap; a bigger
  diff is refused, never cut). The diff SHALL leave out the content of every
  secret-looking path (`isSecretPath`, the ROLES-CHAT-8 rules: `.env*`,
  `.ssh`, keystores, keys, credentials; `SECRET_GIT_EXCLUDE_PATHSPECS`) and
  name those paths instead (content withheld), and a secret path found past
  the excludes SHALL fail closed (a one-line refusal, no call). The reply's findings (the `findings` array of
  its JSON, else its bullet lines, else an explicit clean reply means none,
  else the whole text is one finding) SHALL be scrubbed before they are cut
  to one line of `REVIEW_FINDING_MAX_CHARS` and kept to
  `REVIEW_FINDINGS_MAX` (10; the rest counted). A round that raises nothing
  ends the cycle (`clean`); round `REVIEW_MAX_ROUNDS` (3, a constant, its
  own counter, not the AGENT-4.a verify retries) always ends it
  (`max-rounds`); any other round with findings SHALL refuse with
  `reviewHold: "findings"`, exit 2, a fixed line naming round k of 3 and the
  reviewer and saying how to go on (change, commit and push, then call again;
  or call again unchanged to open with them listed as not changed), and the
  findings numbered inside an untrusted-data fence; `data.review` carries
  only the round, the maximum, the reviewer and the count. Each round SHALL
  be stored in the `pr_review_rounds` table (created on first use, no
  schema version bump; keyed (repo lower-cased, head) with cycle and round,
  tied to the reviewed tree id; reviewer, authors, findings and the changed
  paths since the previous round's tree — `git diff --name-status` between
  the two trees, at most `REVIEW_PATHS_MAX` — scrubbed on write and listed in
  `SCRUB_TARGETS`; `opened_at` once a PR listed it). Round 1 of a new cycle
  after one that ended with no PR listing it SHALL record the paths changed
  since that cycle's last tree.
- **Without a run model** (`corvidinho plugins run github-pr-create`, the
  /work PR step, REQ-discord-088): no round SHALL start; the PR opens only
  when the latest cycle for (repo, head) ended on the exact tree of the
  branch on GitHub.
- **`/work`** (REQ-agent-092, REQ-cli-092, REQ-discord-088): the run's
  review hook (`workReviewHook`, `maxRounds` 3) SHALL run the same review
  step as the gate with a run model (`reviewStep`: the same reviewer,
  rounds, declined and max-rounds ends and `pr_review_rounds` records) on
  the tree `/work` will commit — `reviewTree(root, {untracked: true})`
  stages with `git add --all` into the index copy, so untracked,
  non-ignored files count (a secret-looking one's content is still never
  sent) — keyed by the (repo, branch) its PR opens on (`workReviewTarget`:
  the OWNER/REPO of `origin`'s push URL, the branch checked out, the base
  from `resolveBase`; no branch, repo or base refuses in one line), with the
  fixed title `Corvidinho /work task` (the run's task text, which carries
  identity and memory blocks, is not sent). A round with findings SHALL come
  back as the next attempt's feedback (`workReviewFeedback`: what to do —
  change the tree, or leave it to decline — then the findings numbered in an
  untrusted-data fence, scrubbed, at most `WORK_REVIEW_FEEDBACK_MAX` (3800,
  under the verify feedback cap) characters, later findings counted). A
  `ReviewSpendStop` SHALL become the run's spend-cap ask
  (`takeSpendAsk`), else a refusal; any other error is a refusal.
  `workTreeReviewed(cwd, repo, branch)` SHALL be true only when the latest
  cycle for (repo, branch) ended on exactly that tree (fail closed).

Either way the branch on GitHub SHALL be the reviewed tree — read with
`repos.getBranch` (an `owner:branch` head on that owner's same-named repo;
`githubBranchTree`), or in a dry run (`CORVIDINHO_GITHUB_DRY_RUN=1`) from
the push remote with `git ls-remote origin` (`pushRemoteTree`). The opened
PR's body SHALL be the caller's body (a heading in it that imitates the
section marked `(quoted)`), then a `## Second-model review` section, then
the attribution (placed after the section when the body already ended with
it): rounds used of 3, each round's reviewer and what it raised (fenced,
numbered), the paths that changed after each round (fenced), and for the
last round's findings, not changed (declined, or round 3 ends the review);
scrubbed, with no amounts. It SHALL list every round since the last PR
opened from the branch: the finishing cycle and, before it, each earlier
cycle of (repo, head) no opened PR listed (`opened_at` unset;
`unopenedEarlierRounds`), so a review that ended before the tree changed
again stays listed. Once a live `pulls.create` succeeds, the rounds it
listed SHALL be marked (`markReviewOpened`, best effort); a dry run marks
nothing.

Anything else SHALL refuse with `reviewHold: "refused"`, exit 2, and one
plain line starting `PR not opened: ` (`REVIEW_REFUSAL`): no second model
(GITHUB-9.a), no finished review for the tree (no run model), not a git
checkout top level, the tree or base unreadable, no changes against the base,
a diff over the cap, a provider error (a fixed reason from
`modelFailureReason`, never provider text) or an empty reply, the record
unavailable, the branch unreadable on GitHub or not the reviewed tree. A
refused or failed review records nothing. A review call stopped at a SAFE-8
spend cap (a completion with no model failure while the run was not stopped)
SHALL throw `ReviewSpendStop` instead, so the run stops at the cap's Approve
card or ask (REQ-agent-092), never "unavailable".

Acceptance Criteria
- `resolveReviewer` lists configured models in `CORVIDINHO_LLM_MODEL`, `_READ`, `_TOOL`, `_CODE` order, each label once; skips authors by model id across kinds and entries without their key; returns null when only authors remain; no other env key names a reviewer.
- `reviewTree` of a work tree with an edit, a staged new file, an untracked file and a deletion equals the tree a commit of the tracked files then has (the untracked file left out), and leaves `git status` and the staged list unchanged; an untracked scratch file beside the pushed branch neither blocks the PR nor reaches the reviewer.
- A tracked file rewritten with the same size in the same second as the last index write (its entry's whole-second ctime and mtime and its size equal the file's) is in `reviewTree`'s tree when the review runs in a later second; the real index is unchanged.
- A committed `.env.local` and `config/credentials.json` are named to the reviewer but their content is never sent; a change to secret-looking paths only is still reviewed by name.
- Findings parse from JSON, a fenced JSON block, bullets; an explicit clean reply is none; other text is one finding; capped at 10 with the rest counted; scrubbed before the cut. The review call's user message is the scrubbed title and diff in an untrusted fence the diff cannot close.
- With a run model (dry run, temp repos with a bare origin): round 1 findings refuse with `reviewHold: findings`, round 1 of 3, the reviewer, the fenced findings; after a change is committed and pushed, a clean round 2 opens the PR whose body has the section (2 of 3 rounds, round 1's finding, `M  src/app.ts` changed after round 1, round 2 raised nothing, no amounts) before the attribution.
- The same tree after findings opens with them listed as not changed (`declined`); round 3 with findings opens (`max-rounds`) and the same tree later opens with no 4th review call.
- Unpushed edits, a branch not on GitHub, no changes against the base and a non-git cwd refuse in one line; after the push the PR opens with no new review call.
- A cycle that ended (clean round 2 on an unpushed edit) and a new cycle on the pushed, changed tree: the PR lists round 1's finding, `M  src/app.ts` and `A  src/more.ts`; after the rounds were marked opened, a later cycle lists only its own rounds; a live `pulls.create` (mocked fetch) marks the rounds it listed.
- No second model refuses with the GITHUB-9.a line and calls no reviewer; a provider error refuses with `<reviewer> failed (HTTP 500)` and none of the provider's text; a diff over 200 KiB refuses and calls no reviewer; none of these records a round; an author recorded for the branch is never its reviewer.
- A review completion with no model failure (a spend-cap stop) makes `runPlugin` reject with `ReviewSpendStop` and records nothing.
- Without a run model: no finished cycle, a finished cycle for another tree, or an open cycle refuse in one line; a finished cycle for the pushed tree opens with its findings listed. Live mode without a token fails before any review call.
- `githubBranchTree` returns the head commit's tree, reads an `owner:branch` head on that owner's repo, and is null on a 404. `SCRUB_TARGETS` lists `pr_review_rounds` (`reviewer`; JSON `authors`, `findings`, `changed`) and `pr_change_authors` (`model`).
- `/work` (temp repo, scripted provider, the real tool loop and verify gate): the untracked new file is in the reviewed diff, the reviewer gets `Title: Corvidinho /work task` and not the task text, the rounds are stored (round 1 open with its finding, round 2 `clean` with `M  src/greet.ts` changed), `workTreeReviewed` is true, and the /work PR opens with the section; a finished review of an earlier tree is not this tree's.
- `workReviewFeedback` stays within 3800 characters (under the 4000 verify feedback cap) with its fence whole and later findings counted; a spend-cap stop gives the hook's `ask` when the run left one, else a refusal, and records nothing.

### REQ-plugins-125

AGENT-12: `spawnCapped` (`plugins/fledge/spawn.ts`, the bounded spawn of the
shell, the language runners and Fledge commands) SHALL count each non-empty
chunk its child writes on stdout or stderr — also past the byte cap — as
the calling run's activity (`noteIdleActivity`, REQ-agent-244), so a tool
that keeps printing is never stopped by the idle timeout and a tool that
prints nothing for that long is. Outside a run it does nothing; the cap,
timeout, abort and process-tree kill are unchanged (REQ-plugins-154).

Acceptance Criteria
- Inside a run with a 500 ms idle timeout, a `spawnCapped` child that prints every 0.1 s for 1.5 s exits 0 without the watchdog firing; a child that sleeps 1.2 s silently lets it fire.
- Fixture: `tests/agent.limits.test.ts`.
### REQ-plugins-318

The plugin host SHALL provide a typed `web-search` builtin (PLUGIN-7, #318)
registered from `plugins/web` next to `web-fetch` (`loadWebPlugins`,
`createWebCommands`) and declared `dangerous: true` and `minTier: 1`
(PLUGIN-2): being dangerous it SHALL need SAFE-1 consent (left out of the
default tool catalog, offered and run non-interactively only when
`CORVIDINHO_ALLOWLIST` names it, never at the read tier) and every run SHALL
be audited (SAFE-5, through `runPlugin`). It SHALL be for the owner and the
team only (PLUGIN-9, REQ-plugins-065 `TEAM_SEARCH_TOOLS`), never community,
WATCH or schedules; `delegate` / `council` workers never get the key
(REQ-agent-117), so a search there answers not configured. It never posts, so it carries no must-ask entry
(AUTONOMY-11); a post a search run makes still goes through its own tool's
gate. Deep research is not built.
Its handler SHALL, in order: read the key from `BRAVE_SEARCH_API_KEY` in the
run's env only, trimmed, with no default — unset or blank, or not 8–256
printable non-space ASCII characters, SHALL be `ok: false`, exit 1,
`data.code` `not-configured` and an error that starts `web-search
not-configured: web search is not configured` and names
`BRAVE_SEARCH_API_KEY` (never a silent empty result, never the value), with
no DNS, request or spend; parse
`<query words…> | --query <text> [--count N] [--freshness f] [--json]`,
where the query (words joined by one space, control and invisible
characters removed, trimmed) is 1–400 characters and at most 50 words,
`--count` is a whole number (digits only) from 1 to 20 (default 5) and
`--freshness` is `pd`, `pw`, `pm` or `py`, and any other `--flag` is
refused, so a term that starts with `--` goes in `--query` (the usage line
says so); query words and `--query` together, or `--query`, `--count` or
`--freshness` given twice, are refused (never a silently dropped part of the
request) — a usage error is exit 1, `data.code` `usage`, nothing sent; refuse (exit 2, `data.code` `secret`, SAFE-6) a query that
carries a value `scrubSecrets` would redact or the value of a set secret env
var (`redactSecretEnvValues`, the key included), also once every format
character (a joiner) is taken out, before any spend or request; end a run
that is already stopped (its abort signal set) as `aborted` (exit 1) with no
reservation and nothing sent; reserve its price against the SAFE-8
cap (REQ-agent-098 `reserveFlatSpend`, `BRAVE_SEARCH_COST_MICRO_USD` 5000 =
$0.005, provider `api.search.brave.com`, model `brave-web-search`) — a
stopped reservation SHALL be `ok: false`, exit 2, `data.code` `spend-cap`,
the error `web-search spend-cap: refused: Work is paused for budget.
(SAFE-8)` (no amount, cap or setting name, SAFE-14.a) and the spend-cap ask
in `PluginHandlerResult.spendAsk`, with nothing sent; then send one
`GET https://api.search.brave.com/res/v1/web/search` with `q`, `count`,
`safesearch=moderate` (always, explicitly) and `freshness` when given, and
the key only as the `X-Subscription-Token` header, through the keyed JSON GET
(REQ-plugins-3181) with `api.search.brave.com` as the only allowed host and
the run's abort signal. The reservation SHALL settle as the call's cost on a
2xx, to 0 on an HTTP error reply or a refusal before connecting, and stay at
the estimate on any other failure.
A 401 / 403, or a 422 whose `error.code` is `SUBSCRIPTION_TOKEN_INVALID`,
SHALL be `auth` (naming `BRAVE_SEARCH_API_KEY`); another 422 `bad-request`;
429 `rate-limited`; any other status `http-status` with the numeric status
only — the server's text is never shown. Any other failure SHALL be the
fixed line `web-search unexpected: the search failed unexpectedly` (exit 1),
never the error's own text. Refusals (`secret`, `spend-cap`,
`scheme`, `host`, `blocked`, `redirect`) SHALL exit 2 and other failures
exit 1, each with `data.code` and one line of at most 300 characters: controls and
invisible characters normalised first, then scrubbed, then capped.
On success the hits SHALL be Brave's `web.results[]` entries, at most
`count`: title and description (and `age` when given) reduced from HTML to
one line of plain text (entities decoded, tags, control and invisible
characters (zero-width, bidi, soft hyphen, tag characters) removed; capped at 200 / 500 / 64 characters) and the URL kept only when it
parses as an http(s) URL without credentials of at most 2048 characters
(else the hit is dropped). Every title, URL, description and age SHALL reach
the model only inside the untrusted web fence (`fenceUntrusted`, source
`brave-search`, a per-call random marker id): the fenced body lists the hits
numbered (title, `URL:` line, description, `Age:` line) or `(no results)`.
`data` SHALL be `{ provider: "brave", attribution: "Powered by Brave
Search", safesearch: "moderate", count, freshness?, results, untrusted:
true, content }`, and the summary `web-search: <n> result(s) from Brave
Search (safesearch moderate[, freshness f]). Powered by Brave Search.`
(`--json` / json mode: the summary alone; otherwise followed by the fenced
content). The SAFE-13 detector SHALL scan the result (REQ-agent-071). No
output, error, data field or audit row SHALL carry the key, the request URL,
a request header or the pinned address: every returned string SHALL pass
`scrubSecrets` and `redactSecretEnvValues` (the key is a SAFE-6 secret env
name, REQ-discord-417) as its last step, after the fence and any control or
invisible-character strip, so a key split by such a character is never
rebuilt. The Brave attribution is in the tool result only (`data` and the
summary the model reads); no reply footer adds it. No table, column or schema version; one new env var,
`BRAVE_SEARCH_API_KEY` (documented in `.env.example` and
`docs/DISCORD-GO-LIVE.md` E.3.a).

Acceptance Criteria
- `plugins list` shows `web-search` with dangerous=true, minTier=1 next to `web-fetch`; the catalog offers it at tool/code tier only when the allowlist names it, never at read tier; a non-interactive run without the allowlist entry is denied (SAFE-1) with a `denied` audit row, and an allowlisted run records `started` then its outcome (SAFE-5).
- The owner, no role session and team (chat and `/work`) are offered it when allowlisted; community never is; a community role session's `runPlugin web-search` gets the role refusal while a team one reaches the handler.
- With a fake key, one request goes to the pinned address of `api.search.brave.com` at `/res/v1/web/search` with `q`, `count=5`, `safesearch=moderate` and the key only in `X-Subscription-Token`; `--count 20 --freshness pw` and `--query` are passed.
- A count of 0, 21, 5.5, `abc`, `-3` or `1e1`, a missing count value, an unknown freshness or flag, query words together with `--query` (either order), `--query`, `--count` or `--freshness` given twice (`--query "cute cat" --query dog` is `--query given twice`, never `dog` alone), a `--verbose` term outside `--query`, a missing, blank, 401-character or 51-word query are usage errors (exit 1) with no DNS or request; the usage line says a term that starts with `--` needs `--query`, and `--query "what does --verbose do"` is taken whole.
- No key, a blank key and a malformed key give the `not-configured` error, starting `web-search not-configured: web search is not configured` and naming `BRAVE_SEARCH_API_KEY`, no DNS and no request, never an empty success; the malformed value is not echoed.
- A query carrying a `ghp_…` token, a set secret env value or the key is refused with exit 2 before DNS, request or spend, and the value is not echoed.
- Hostile titles and descriptions (an injection line, a guessed end marker, control characters, HTML) appear only inside the fence, whose end marker is unique and last; HTML, entities and controls are reduced; nothing of a hit appears outside the fence; the summary carries the Brave attribution; at most `count` hits; `javascript:` and credentialed URLs are dropped; no results is an ok `(no results)`.
- A server echoing the key in results, a 422 body, a 500 body, a non-JSON body, a transport error or a DNS error: nothing returned (json or text mode) contains the key; through `runPlugin` neither the result nor the audit rows contain the key, the request path, the header name or the pinned address.
- The key split by a zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in a title, URL, description and age (json and text mode), or in a resolver answer a SAFE-7 refusal names, never comes back whole: the fenced content shows `[redacted:env-secret]`, and `fenceSearchResults` scrubs after the fence; a query carrying the key split by a joiner is refused (`secret`).
- 401, 403, 422 `SUBSCRIPTION_TOKEN_INVALID`, 422 `VALIDATION`, 429 and 503 map to `auth`, `auth`, `auth`, `bad-request`, `rate-limited` and `http-status` without the server's text; a redirect is exit 2 `redirect` without the Location.
- The run's abort reaches a pending search: it ends `aborted` and the transport's own signal is aborted; a run already stopped sends nothing (no DNS, no request).
- An unexpected failure (a resolver answer that throws) is the fixed `web-search unexpected: the search failed unexpectedly` line, with neither the key nor the request path.
- Regression tests in `tests/web.search.test.ts` fail on the base sources and pass after; the repeated-flag rows (#318 slice B review) fail on slice A's head and pass after.

### REQ-plugins-3181

`plugins/web/api.ts` SHALL provide the one request path for commands that
call a fixed third-party JSON API with a secret key: `web-search`
(REQ-plugins-318, its key in a request header) and `gif-search`
(REQ-plugins-3182, its key in the URL's query, which is why no error or
result carries the request URL): `apiGetJson({ url, allowedHosts,
headers?, signal? }, deps?)` with `resolver`, `transport`, `timeoutMs` and
`maxBytes` seams. Before DNS it SHALL refuse a URL that is not `https`
(`scheme`), carries credentials (`blocked`), or whose host (lower-cased,
trailing dot dropped) is not in the calling command's `allowedHosts` or whose
port is not the default (`host`) — SAFE-7. It SHALL then apply the
`web-fetch` address guard (REQ-plugins-111), shared from `fetch.ts`
(`pinTargets`, `dialPinned`, `readCapped`, `mediaType`): resolve once,
refuse if any answer is not a public address (`blocked`, SAFE-7), and dial
only the checked IPs, pinned, in answer order, with Host and TLS SNI keeping
the name. The request SHALL carry `User-Agent`, `Accept: application/json`
and `Accept-Encoding: identity` plus the caller's headers. Every 3xx reply
SHALL be refused (`redirect`) and never followed, its `Location` never read
or echoed. A non-2xx reply SHALL be an `http-status` error carrying the
numeric status and, best effort, the parsed JSON body for the caller to map a
provider's fixed error code, never shown. A 2xx body SHALL be JSON
(`application/json` or a `+json` media type, a valid RFC 6838 token,
otherwise `content-type`), identity-encoded (otherwise `content-type`), at
most 1 MiB (`API_MAX_BYTES`; more is `too-large`, never parsed) and valid
UTF-8 JSON (otherwise `invalid-json`). DNS, connect and body SHALL share one
15 s deadline (`API_TIMEOUT_MS`, `timeout`) and the caller's signal SHALL
abort the call (`aborted`). The result SHALL be `{ status, json, bytes }`
only: no error or result SHALL carry the request URL (its query may hold a
key), a request header, server text or a transport's or resolver's free
text — an error names at most the host, a SAFE-7 refused address and a fixed
reason (an `E…` code, `TLS error` or `connection failed`).
`API_NOT_SENT_CODES` (`invalid-url`, `scheme`, `host`, `blocked`, `dns`)
SHALL name the codes raised before anything was sent. `web-fetch` keeps its
own path and behaviour for any public host (http or https, its fixed
headers, manual redirects).

Acceptance Criteria
- `http://`, another host, a look-alike host, port 8443 and URL credentials are refused before DNS or any dial; the allowlisted host in upper case with a trailing dot and port 443 passes.
- The allowlisted host resolving to loopback, private, link-local / metadata, `::1` or unique-local (alone or next to a public answer) is refused before connecting; a public answer is the only address dialed.
- 301, 302, 303, 307 and 308 are refused after one dial and one DNS lookup, and the error does not carry the Location.
- `text/html`, `gzip` encoding, a missing content type, malformed JSON and a body over the byte cap are refused; `application/vnd.api+json` is read; `API_MAX_BYTES` is 1 MiB and `API_TIMEOUT_MS` 15 s; a stalled transport times out and the caller's abort stops the call, and in both cases the transport's own request signal is aborted.
- A body that fails mid-read is `network`, naming the host and a fixed reason (`ECONNRESET`) only.
- A connect, TLS or DNS failure names only the host and a fixed reason (`ECONNREFUSED`, `TLS error`, `ENOTFOUND`), never an address, the path or query, or the transport's or resolver's text.
- `web-fetch` still fetches http and https URLs on any public host with its own fixed headers and no key header.
- `gif-search` calls it with `api.giphy.com` as its only allowed host and its key in the URL query: a non-public answer and every redirect are refused, its fixed error codes (`too-large` and `network` included) carry no server or transport text, and no result, error or audit row carries the request URL or the key (`tests/gif.search.test.ts`).
- Tests in `tests/web.search.test.ts` and `tests/gif.search.test.ts`.

### REQ-plugins-3182

The plugin host SHALL provide a typed `gif-search` builtin (PLUGIN-8, #318
slice B) registered from a new `plugins/gif` (`loadGifPlugins`,
`createGifCommands`, loaded by `loadBuiltins` after the web plugins) and
declared `dangerous: true` and `minTier: 1` (PLUGIN-2): being dangerous it
SHALL need SAFE-1 consent (left out of the default tool catalog, offered and
run non-interactively only when `CORVIDINHO_ALLOWLIST` names it, never at the
read tier) and every run SHALL be audited (SAFE-5, through `runPlugin`). It
SHALL be for the owner and the team only (PLUGIN-9, REQ-plugins-065
`TEAM_SEARCH_TOOLS`), never community, WATCH or schedules; `delegate` /
`council` workers never get the key (REQ-agent-117). It never posts, so it
carries no `mustAsk` entry (AUTONOMY-11); it SHALL NOT download a GIF or hand
one to `discord-send-file`: a run shares a GIF as a link in its own reply
(PLUGIN-8, GIPHY's terms against caching or re-hosting), and a
`discord-post-message` a GIF run makes still goes through that tool's gate.
Its handler SHALL, in order: read the key from `GIPHY_API_KEY` in the run's
env only, trimmed, with no default — unset or blank, or not 8–128 letters,
digits, `_` or `-`, SHALL be `ok: false`, exit 1, `data.code`
`not-configured` and an error that starts `gif-search not-configured: GIF
search is not configured` and names `GIPHY_API_KEY` (never a silent empty
result, never the value), with no DNS, request or spend; parse
`<query words…> | --query <text> [--limit N] [--json]`, where the query
(words joined by one space, control and invisible characters removed,
trimmed) is 1–50 characters (GIPHY's limit), `--limit` is a whole number
(digits only) from 1 to 10 (default 5), and any other `--flag` — `--rating`
and `--contentfilter` among them — is refused, so the filter can never be
changed and a term that starts with `--` goes in `--query`; query words and
`--query` together, or `--query` / `--limit` given twice, are refused (never
a silently dropped part of the request) — a usage error is exit 1,
`data.code` `usage`, nothing sent; refuse (exit 2, `data.code` `secret`, SAFE-6) a query
that carries a value `scrubSecrets` would redact or the value of a set secret
env var (`redactSecretEnvValues`, this key included), also once every format
character is taken out, before any spend or request; end a run that is
already stopped as `aborted` (exit 1) with no reservation and nothing sent;
reserve its price against the SAFE-8 cap (REQ-agent-098 `reserveFlatSpend`,
`GIPHY_SEARCH_COST_MICRO_USD` 0 — GIPHY's API is free-tier, so the row is
recorded at $0 —, provider `api.giphy.com`, model `giphy-gif-search`) — a
stopped reservation SHALL be `ok: false`, exit 2, `data.code` `spend-cap`,
the error `gif-search spend-cap: refused: Work is paused for budget.
(SAFE-8)` and the spend-cap ask in `PluginHandlerResult.spendAsk`, with
nothing sent; then send one `GET https://api.giphy.com/v2/search` (GIPHY's
Tenor-compatible search, whose `contentfilter=medium` GIPHY documents as G
and PG) whose query string is built from scratch with `q`, `key` (the key),
`client_key=corvidinho`, `limit`, `media_filter=gif,tinygif` and
`contentfilter=medium` (always; query text is only ever the `q` value and can
add or change no parameter), through the keyed JSON GET (REQ-plugins-3181)
with `api.giphy.com` as the only allowed host, no header beyond the fixed API
headers, and the run's abort signal. The reservation SHALL settle as `billed`
on a 2xx, `not-billed` on an HTTP error reply or a refusal before
connecting, and `unknown` on any other failure (every outcome is $0).
A 401 / 403 SHALL be `auth` (naming `GIPHY_API_KEY`); 400 / 422
`bad-request`; 429 `rate-limited`; any other status `http-status` with the
numeric status only. A 2xx body without a `results` array SHALL be
`api-error` when it has an `error` field (GIPHY's Tenor-compatible layer
answers some errors with HTTP 200) and `bad-response` otherwise — GIPHY's
text is never shown. Any other failure SHALL be the fixed line `gif-search
unexpected: the GIF search failed unexpectedly` (exit 1), never the error's
own text. Refusals (`secret`, `spend-cap`, `scheme`, `host`, `blocked`,
`redirect`) SHALL exit 2 and other failures exit 1, each with `data.code`
and one line of at most 300 characters: controls and invisible characters
normalised first, then scrubbed, then capped.
On success the hits SHALL be GIPHY's `results[]` entries in GIPHY's order, at
most `limit`: the title reduced from HTML to one line of plain text
(entities decoded; tags, control and invisible characters removed; capped at
200 characters; `(untitled)` when empty) and the `media_formats.gif.url` and
`media_formats.tinygif.url` links, each kept only when it parses as an https
URL without credentials, on the default port, whose host is exactly one of
`GIPHY_MEDIA_HOSTS` (`plugins/gif/hosts.ts`: `media.giphy.com`,
`media0.giphy.com` to `media4.giphy.com`, `i.giphy.com`; no suffix match, no
trailing dot), whose path holds only letters, digits, `.`, `_`, `~`, `%`, `/`
and `-` and whose query only letters, digits, `.`, `_`, `~`, `%`, `-`, `=`
and `&` (so a link the run pastes cannot become Discord markdown such as a
masked link to another host or a mention), of at most 2048 characters, with
any fragment dropped. A result with neither link (or that is not an object)
SHALL be dropped and counted; nothing else is filtered or reordered, and
GIPHY's page URLs (`url`, `itemurl`) are not returned. Every title and link SHALL reach the model only inside the
untrusted web fence (`fenceUntrusted`, source `giphy-search`, a per-call
random marker id): the fenced body lists the results numbered (title, `GIF:`
and `Small GIF:` lines) or `(no results)`. `data` SHALL be `{ provider:
"giphy", attribution: "Powered By GIPHY", contentfilter: "medium", limit,
results, dropped, postAs: "link", untrusted: true, content }` (`dropped`: the
results left out for their links), and the summary `gif-search: <n> GIF(s)
from GIPHY (contentfilter medium: rated G and PG).[ <k> result(s) left out:
no link on a GIPHY media host.] Only when someone asks for a GIF, post one
as a link in your reply (Discord shows it from GIPHY); never download or
attach it. Powered By GIPHY.` (the bracketed part only when `dropped` is
above 0, so a search whose every result was left out never reads like a
real empty one; `--json` / json mode: the summary alone; otherwise followed
by the fenced content). The command's description SHALL say to use it only
when someone asks and to post one as a link (PLUGIN-8, "post it as a link
when asked"). The SAFE-13 detector SHALL
scan the result (REQ-agent-071). No output, error, data field or audit row
SHALL carry the key, the request URL (its query holds the key), the pinned
address or GIPHY's text outside the fence: every returned string SHALL pass
`scrubSecrets` and `redactSecretEnvValues` (`GIPHY_API_KEY` is a SAFE-6
secret env name, REQ-discord-417) as its last step, after the fence and any
control or invisible-character strip. No table, column or schema version;
one new env var, `GIPHY_API_KEY` (documented in `.env.example` and
`docs/DISCORD-GO-LIVE.md` E.3.b, which also carry "Powered By GIPHY").

Acceptance Criteria
- `plugins list` shows `gif-search` with dangerous=true, minTier=1, no must-ask entry and a description that says `only when someone asks` and `post one as a link`; it is in `NO_STATE_CHANGE_TOOLS`; the catalog offers it at tool/code tier only when the allowlist names it, never at read tier; a non-interactive run without the allowlist entry is denied (SAFE-1) with a `denied` audit row, and an allowlisted run records `started` then its outcome (SAFE-5).
- The owner, no role session and team (chat and `/work`) are offered it when allowlisted; community never is; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler.
- With a fake key, exactly one request goes out, to the pinned address of `api.giphy.com` at `/v2/search`, with exactly `q`, `key`, `client_key=corvidinho`, `limit=5`, `media_filter=gif,tinygif` and `contentfilter=medium`, and only the fixed API headers (no key header); no GIF is downloaded.
- A query of `cats&contentfilter=off&rating=r` (and similar) is sent as the `q` value only, with one `contentfilter=medium`, one `key` and no `rating` parameter.
- `--contentfilter off`, `--rating r`, `--media-filter mp4`, `--download`, a limit of 0, 11, 2.5, -1 or a missing one, query words together with `--query`, `--query` or `--limit` given twice (`--query "cute cat" --query dog` is `--query given twice`, never `dog` alone), and a missing, blank or 51-character query are usage errors (exit 1) with no DNS or request; the usage line says the safety filter is fixed at medium.
- No key, a blank key, a key with a space and a 5-character key give the `not-configured` error, starting `gif-search not-configured: GIF search is not configured` and naming `GIPHY_API_KEY`, with no DNS and no request, never an empty success.
- A query carrying a `ghp_…` token, a set secret env value (Discord, Brave) or the GIPHY key (also split by a joiner) is refused with exit 2 before DNS, request or spend, and the value is not echoed.
- Titles and links appear only inside the fence in GIPHY's order (a hostile title, a guessed end marker and control characters included); the end marker is unique and last; HTML and entities are reduced; nothing of a result appears outside the fence; `data` and the summary carry `Powered By GIPHY`, `postAs: "link"`, `dropped: 0` and the guidance to post one only when someone asks, as a link.
- Links over http, off the GIPHY media hosts (look-alike and suffix hosts, `giphy.com` page URLs, `media5`), with credentials, on port 8443, with a trailing-dot host, over 2048 characters, or with Discord markdown or a mention after the host (`)[click](https://evil.example)` in the path or query, `<@…>`, `<@&…>`, `**`, `|`, `@everyone`) are dropped; a fragment is cut off (`#@everyone` never passes); GIPHY's own `/media/v1.…/giphy.gif?cid=…&rid=giphy.gif&ct=g` links pass whole; a result with only a valid `tinygif` keeps only its `Small GIF:` line; a result with no valid link is dropped and counted in `data.dropped` and the summary; the rest keep GIPHY's order up to `--limit`.
- Results that all fail the link check are an ok `(no results)` with `results: 0`, `dropped: k` and the summary line `k result(s) left out: no link on a GIPHY media host.`; a real empty search has `dropped: 0` and no such line.
- No results is an ok `(no results)`; a 2xx `{ error: … }` body is `api-error` and a 2xx body without `results` is `bad-response`, neither showing GIPHY's text.
- A server echoing the key or the request URL in titles, links, a 401 body, a 500 body, a 2xx error body, a non-JSON body, a redirect Location, a transport error or a DNS error: nothing returned (json or text mode) contains the key or the request's query string, and no error carries the path, `key=` or the Location; GIPHY's own echo inside the fence shows `key=[redacted:env-secret]`.
- The key split by a zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in a title or link (json and text mode), in a resolver answer a SAFE-7 refusal names, or straight into `fenceGifResults`, never comes back whole.
- Through `runPlugin` neither the result nor the audit rows contain the key, the request path, `key=`, the API host or the pinned address.
- A non-public answer for `api.giphy.com` is refused (exit 2 `blocked`) before connecting; a redirect is refused (exit 2 `redirect`) after one dial without following it or echoing its Location.
- 401, 403, 400, 422, 429 and 503, a `text/html` body, malformed JSON, a body over the byte cap and a failed connection map to `auth`, `auth`, `bad-request`, `bad-request`, `rate-limited`, `http-status`, `content-type`, `invalid-json`, `too-large` and `network` without the server's or the transport's text (a failed connection is `gif-search network: api.giphy.com: request failed (connection failed)`).
- With `CORVIDINHO_DAILY_SPEND_CAP_USD` set to something that is not a number, the search is stopped with the `spend-cap` ask (exit 2, "Work is paused for budget."), with no DNS, request or ledger row and without echoing the value.
- The run's abort reaches a pending search (`aborted`, the transport's signal aborted), a stalled one times out, and a run already stopped sends nothing; an unexpected failure is the fixed `gif-search unexpected: the GIF search failed unexpectedly` line.
- Tests in `tests/gif.search.test.ts` (a new module on the base sources) fail on the base sources and pass after.

### REQ-plugins-110

In a project folder that isn't a git repo, its file tools can't change the
root AGENTS.md or CLAUDE.md; the owner edits those (AGENT-1.b, captured in
this change's PR from Leif's 2026-09-30 decision, round 13 of the 2026-09-28
record). There the AGENT-1 loader reads those files from disk into every
run's prompt (REQ-agent-084), so a file tool that could change them could
plant instructions for later runs.

- When `isGitRepo(cwd)` is false, `files-write`, `files-edit` and
  `files-delete` SHALL refuse (exit 2, `refused (AGENT-1.b): …`, nothing
  written) a path that, where the write would land (`resolveProjectPath`),
  is equal to or under `<realRoot(cwd)>/AGENTS.md` or `/CLAUDE.md`
  (`PROJECT_INSTRUCTION_FILES`), or equal to or under the file a symlink of
  that name leads to, or a regular file that shares the inode of one of them
  (a hard link); `isNonGitRootInstructionPath` in
  `plugins/files/protectedPaths.ts`, checked in `refuseProtected` after the
  SAFE-2 and SpecSync-record rules.
- It SHALL apply to every caller (the owner's runs, the local CLI, `plugins
  run`), with no override. Creating a missing root file is a change too.
- A nested `AGENTS.md` (not at the root), other files, reads, and a git
  project's root copy (where only the committed copy is loaded) SHALL be
  unchanged.

Acceptance Criteria
- `tests/plugins.nongit-project-dir.test.ts`: in a non-git folder, `files-write` of `AGENTS.md`, `./CLAUDE.md`, the absolute root path and `AGENTS.md/inner.md`, and `files-edit` / `files-delete` of both, are refused with `refused (AGENT-1.b)` for the local CLI and the owner, and the files stay as they were.
- Same file: a missing `CLAUDE.md` is not created; with `CLAUDE.md` a symlink to `docs/rules.md`, writing `docs/rules.md` is refused; writing a hard link to `AGENTS.md` is refused; `notes.txt`, `src/app.ts`, `sub/AGENTS.md` and `docs/other.md` are written.
- Same file: in a git project `files-write AGENTS.md` still works.
- With the base sources the refusals fail; the git-project case passes on both.

### REQ-plugins-115

Other people's runs only read in a project folder that isn't a git repo
(AGENT-1.a, captured in `hi/agent.md` from Leif's 2026-09-28 interview).
`actingWorkTask(env, cwd)` SHALL be true only when the run carries the
`/work` stamp (`CORVIDINHO_ACTING_WORK_TASK`) and `isGitRepo(cwd)`; `cwd`
is required. `runPlugin` SHALL pass the call's cwd (`opts.cwd`, else the
process cwd), and the agent's catalog and invented-call refusal SHALL pass the
run's cwd (REQ-agent-110), so in a non-git folder a team member's `/work`
run gets the role refusal (`not allowed for your role`, exit 2) for
`files-write`, `files-edit` and the SpecSync change tools, while reads and
review tools are unchanged and in a git worktree the work tools are kept
(IDENTITY-10). The owner and community are unchanged.

Acceptance Criteria
- `tests/plugins.nongit-project-dir.test.ts`: `actingWorkTask` is true for a git repo with the stamp and false for a non-git folder or without the stamp.
- Same file: a team member's `/work` `files-write` / `files-edit` in a non-git folder get the role refusal and the file is unchanged, `files-read` works; in a git repo the write works; the owner's write in the folder works.
- `tests/roles.team.test.ts` (fixture dir now a git repo) keeps team `/work` edits working in a git work tree.
### REQ-plugins-520

AGENT-18 hi guard: in a repo that uses hi (`repoWaysNow(cwd)`: a `hi/*.md`
with `hi:` front matter in the run's session base, HEAD or the working
tree), `files-write`, `files-edit` and `files-delete` SHALL refuse every
path under `hi/` (`isHiPath` on where the write would land, symlinks
resolved by `resolveProjectPath`, and on the path as given), after the
SAFE-2 check and before anything is read or written, with exit 2 and one
line (`hiRefuseMessage`): `refused (AGENT-18): '<path>' is under hi/, where
this repo keeps its acceptance criteria. The agent never changes them itself:
criteria change only through a capture the owner approves on a card, and any
other hi/ change keeps the run from being verified and /work from opening a
PR. Reading hi/ is fine; draft a missing criterion with hi-draft where this
run has it, …`. There SHALL be no in-band override. Reads
(`files-read`, `files-list`, `files-glob`) and `hi/` in a repo that does
not use hi SHALL be unaffected.

Acceptance Criteria
- In a temp hi repo, `files-write` (relative, `./`, absolute, a new file), `files-edit` and an allowlisted `files-delete` under `hi/` refuse with `refused (AGENT-18)` and leave the file unchanged; `files-read hi/agent.md` and a write to `src/app.ts` work.
- A write through a symlink that lands in `hi/` is refused.
- In a repo whose `hi/` has no hi front matter the write goes through; a non-git hi project refuses.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.
- The refusal says criteria change only through a capture the owner approves on a card, and points at `hi-draft` (AGENT-18 hi drafts).

### REQ-plugins-521

AGENT-18 hi guard, the PR a run opens itself: `github-pr-create` SHALL,
after its usage and repo checks and before the GitHub client, the GITHUB-9
review and anything sent to GitHub, ask `hiPrRefusal(cwd)`
(`src/agent/repo-ways.ts`). While a Corvidinho run is in progress in `cwd`
(the run ledger, `currentSddRun`) in a repo that uses hi (`repoWaysNow`),
and anything under `hi/` differs from that run's session base
(`hiRunChanges`: the same comparison as the verify gate, REQ-agent-520), it
SHALL refuse with exit 2 and one line `refused (AGENT-18): this repo's hi/
changed since the session base (criteria …; retired entries …; other hi/
files …) and no approved capture made the change, so this run opens no PR;
…`, and a hi/ diff that cannot be read SHALL refuse the same way ("could not
read what changed under hi/ …"). With no run in progress there (an
operator's own `corvidinho plugins run github-pr-create`, or the `/work` PR
step, which holds hi/ to the merge-base itself, REQ-discord-520) the hi
guard SHALL not apply here. No env var, config key or flag.

Acceptance Criteria
- Inside a run in a temp hi repo, a criterion committed through the shell makes a dry-run `github-pr-create` refuse with `refused (AGENT-18)`, exit 2, naming `criteria AGENT-23` and "this run opens no PR"; with hi/ untouched in a run, it is not refused by the hi guard (the next gate, GITHUB-9, answers).
- With no run in progress, a dirty hi/ edit does not make `github-pr-create` refuse with AGENT-18.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.

### REQ-plugins-1201

IDENTITY-12.a (#65, captured from Leif's 2026-09-28 interview, round 16):
"On GitHub, the owner and team members I've declared get their role's tools
too, behind the same must-ask gate; anyone else stays community." The tool
layer SHALL resolve a WATCH run's role from the person who triggered it, at
every call, the way it resolves a Discord run's (IDENTITY-12):

- `isWatchRunEnv(env)` (`src/plugins/roles.ts`) SHALL be true when the
  surface stamp `CORVIDINHO_ACTING_SURFACE` is `watch` (both spawning clients
  always overwrite it). In such a run the role SHALL come only from the GitHub
  numeric id the WATCH spawn stamps (`CORVIDINHO_ACTING_GITHUB_ID`, REQ-watch-1201),
  matched in the owner's people list re-read now (`loadDeclaredPeople` +
  `resolvePerson`, the owner's `[owner] github_id` included, IDENTITY-7.a) —
  never a login and never a Discord id. A run whose surface is not `watch`
  SHALL never use the GitHub keys.
- `resolveActingIsAdmin` SHALL be true in a WATCH run only with the ADMIN bit,
  an owner stamp (`actingRoleCap` owner), `CORVIDINHO_WATCH_SESSION_ID` set and
  that id resolving to the owner's person. `resolveActingRole` SHALL give
  `team` only with a team (or owner) stamp and a person whose declared role is
  team; anything else is `community`. Either way the id SHALL count as
  community when it, or `CORVIDINHO_ACTING_GITHUB_LOGIN`, is on the GitHub
  `deny_users` list, when the person's Discord id is muted
  (`DISCORD_MUTED_USER_IDS`) or on `[discord].deny_users`, when there is no
  id or no WATCH session id, and on any read failure (never throws).
- `actingWorkTask` SHALL be false in a WATCH run whatever its stamp (a WATCH
  run works in the watcher's checkout, never a `/work` worktree), so team
  gets its review and search tools there but never the work tools.
- `runPlugin` is unchanged: the owner's WATCH run reaches the must-ask gate
  (REQ-plugins-097) for every must-ask call — a `git-push` to the default
  branch, a `discord-post-message` — which raises the owner's Approve card
  (`… · from watch:<session>`) on the shared approvals store that the running
  bridge DMs, and runs only on an approval it uses once; a deny or no answer
  runs nothing (SAFE-20). Team and community WATCH runs are refused an
  owner-only tool for their role before any card.
- `secretPathsRefused` (`plugins/files/protectedPaths.ts`) SHALL be true in
  every WATCH run, the owner's included — the answer goes to a public GitHub
  thread — so the file, search and git tools refuse and hide secret-looking
  paths there (ROLES-CHAT-8, REQ-plugins-267); the refusal line says "not
  available in community chat or on GitHub".
- Unchanged on GitHub: the shell, runners and Fledge runs are never offered
  (SAFE-3.a, `shellToolsGate`), `delegate` / `council` workers are community
  (the worker env drops every `CORVIDINHO_ACTING_*` key), WATCH runs never
  approve or archive a SpecSync change (AGENT-18.a), the memory plugins' GitHub
  rules (REQ-plugins-067, REQ-plugins-710). No env var, config key, flag,
  table or schema change.

Acceptance Criteria
- With the env a real WATCH spawn hands its child: the owner's id with the owner stamp → owner (ADMIN re-check true); the team member's with the team stamp → team.
- The owner stamp on a stranger's, a re-registered login's or a declared community person's id, a team stamp on the owner's id, a community stamp, a login with no id, the owner's Discord id in a WATCH env, and no WATCH session id → community.
- Surface `chat` with the owner's GitHub id and no Discord actor → community; with the owner's Discord id → owner.
- A team member demoted in the file, on GitHub `deny_users` by login or by id, on `[discord].deny_users` or muted → community at the next call; the owner with no `[owner] github_id` or an unreadable file → community.
- The owner's WATCH run: a mutating `prod` must-ask command raises one `mustask` card titled `… · from watch:watch_w1`, runs once on approval and is refused with nothing run on a deny; team, community and a re-registered login's runs get `not allowed for your role` and no card.
- `secretPathsRefused` is true for the owner's WATCH run and false for the owner's Discord run; `shellToolsGate` refuses the owner's WATCH run; a `delegate` worker built from it resolves community.
- `tests/watch.github-roles.test.ts` fails on the base sources and passes on the branch.
### REQ-plugins-621

The `shell-exec` child, the language runners' children (`node-exec`,
`python-exec`, `cargo-exec`, REQ-plugins-313) and the Fledge core runs
(`fledge-lanes-run`, `fledge-run`, and the two lane reads, REQ-plugins-461)
SHALL start without the owner's cloud credentials (SAFE-21.b, captured in
this change's PR from Leif's 2026-09-28 interview, round 16): `runnerChildEnv`
(`plugins/runners/commands.ts`) and `fledgeCoreChildEnv`
(`plugins/fledge/core.ts`) SHALL apply `withoutCloudCredentials`
(`src/agent/verify.ts`, REQ-agent-621) after the verify-lane scrub and the
SAFE-21.a git / GitHub scrub (REQ-plugins-495, unchanged): every
`isCloudCredentialEnvKey` key dropped, `KUBECONFIG`,
`AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
`GOOGLE_APPLICATION_CREDENTIALS` = `/dev/null`,
`AWS_EC2_METADATA_DISABLED=true`, and `CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR`
fresh empty dirs made for that one child. `runRunner`, the `shell-exec`
handler and the Fledge core spawn SHALL call `releaseCloudStandIns` on that
env once the child has exited (also after a timeout, an abort or a spawn
error), so those dirs are removed. Every other key the child got before is
kept. Fledge plugin commands (`fledge-<command>`, `fledgeChildEnv`) are
unchanged. No new slash command, env var or config key.

Acceptance Criteria
- With the owner's cloud env set, and separately with only the owner's default
  files under a fake HOME (`~/.kube/config`, `~/.aws/credentials` /
  `config`, `~/.config/gcloud/*` with the ADC file, `~/.azure/*`),
  `shell-exec` running stand-in `kubectl` / `aws` / `gcloud` / `az` by
  absolute path, each of `node-exec` / `python-exec` / `cargo-exec`
  (`runRunner` with a stand-in binary) and `fledge-lanes-run verify` /
  `fledge-run deploy` (a stand-in fledge) show no cloud key, value or file
  content; `KUBECONFIG`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
  `GOOGLE_APPLICATION_CREDENTIALS` are `/dev/null`,
  `AWS_EC2_METADATA_DISABLED=true`, `CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR`
  lie outside HOME and are gone after the call; `AWS_REGION`,
  `GOOGLE_CLOUD_PROJECT` and other keys stay (`tests/agent.cloud-credentials.test.ts`).
- A runner child that writes a login into its gcloud and az config dirs does
  not reach the next runner child.
- The SAFE-21.a git / GitHub scrub and its tests (`tests/runners.plugins.test.ts`,
  `tests/shell.footguns.test.ts`, `tests/fledge.core.test.ts`) are unchanged.
### REQ-plugins-1818

AGENT-18.a in the shell (captured on main, `hi/agent.md`, from Leif's
2026-09-28 interview, round 13: "On Corvidinho it may approve and archive
its own SpecSync change once verify is green; in other repos a human
approves, reviews and finalizes."). `shell-exec` SHALL refuse
`specsync change approve|review|finalize|ship` in every repo, with no repo
check and synchronously, before the SAFE-21 check (REQ-plugins-494), the
SAFE-3 clamp and any spawn: ok=false, exit 2, `data.refused` true with
`rule: "AGENT-18.a"`, `step` (`approve`, `review`, `finalize` or
`ship`; null when it can't be read) and the in-root `script` it was found
in (null for the typed command), and the message
`shell-exec refused (AGENT-18.a): <invocation> would <step> a SpecSync change
from the shell[ (in SCRIPT)], which the shell never does in any repo;
<HUMAN_LIFECYCLE_LINE without "refused: ">, through its own settle step and
never the shell`. The check (`lifecycleRefusal` / `firstLifecycleStep`,
`plugins/shell/sdd-lifecycle.ts`) SHALL read every simple command over the
SAFE-21 ground through the same walker (`forEachSimpleCommand`: the dash
and bash readings, `eval` / `trap` / shell `-c` strings, command
substitutions, and the in-root scripts the command runs in a shell). An
invocation SHALL start at any word named `specsync` (by basename; an
npm-style `specsync@<version>` or `@scope/specsync` too), so every exec
wrapper (`env`, `timeout`, `nohup`, `xargs`, `sudo`, `exec`,
`find -exec`) and package runner (`bunx`, `npx`) in front of it is
covered; at a command word (`commandChain` link) that is a path to an
existing link whose target is named `specsync`; and at a command word that
expands, where only a literal step refuses. Its step SHALL be the first word
past SpecSync's options after `change` (every `change` the subcommand scan
reaches past options and what may be their values is read); a word right
after an option (no `=`) may be that option's value or the step, so a
lifecycle step there SHALL count. A step that expands SHALL refuse, and
under `xargs` a missing step, or one that is not another `specsync change`
subcommand, SHALL refuse (xargs supplies it). `shellProdWhy` (AUTONOMY-9)
SHALL classify no command this check refuses, so no Approve card is raised
for it. Read-only `specsync change status|list|show|check|ship-status` and
`specsync check` SHALL still run. `runTask`'s settle after a green lane
(REQ-agent-519) is unchanged: on Corvidinho the SpecSync plugin's approve and
finalize tools (REQ-plugins-519) spawn `specsync` themselves, never through
the shell. Residual (stated, not checked): code an interpreter runs
(`bun -e`, `node -e`, `python -c`, a script handed to `node` /
`python`, the `node-exec` / `python-exec` / `cargo-exec` runners) that
spawns specsync itself is not parsed; neither are package-manager scripts,
`make` / `just` recipes and git aliases, nor a copy of the binary under
another name or a link the same command makes. No new command, env var,
flag, config key or schema.

Acceptance Criteria
- In a SpecSync repo, a plain folder and on Corvidinho with the run's own change right after a green lane, `specsync change approve|review|finalize|ship c1` through `shell-exec` returns exit 2 with `shell-exec refused (AGENT-18.a): …` and `HUMAN_LIFECYCLE_LINE`; nothing is spawned, `state.json` is unchanged, no `approvals.json` / `review.json` is written and nothing moves to `.specsync/archive`.
- The same through `sh -c` / `bash -c`, `eval`, `$(…)`, backticks, a function, `env` / `timeout` / `nohup` / `xargs` / `sudo` / `exec` / `find -exec`, an absolute or relative path or a link to the binary, `bunx` / `npx`, options before the step, an expanding step or command word, and an in-root script run with `sh x.sh`, `. ./x.sh` or `./y.sh` (naming it).
- `specsync change status|list|show|check|ship-status` and `specsync check` still run; `shellProdWhy` returns null for a refused lifecycle command.
- On Corvidinho the `specsync-change-approve` tool still spawns `change approve c1 --actor corvid-agent`; `tests/agent.repo-ways.test.ts` passes unchanged.
- `tests/shell.sdd-lifecycle.test.ts` fails on the base sources and passes after.
### REQ-plugins-525

`.trust.toml` is SAFE-2 protected like `fledge.toml` (AGENT-18 Trust clause,
REQ-agent-525): in a repo that has it the verify gate also runs `fledge trust
verify`, so a run must not rewrite or delete the Trust config it is verified
by. `isProtectedPath` SHALL be true for any path whose basename is
`.trust.toml` (any directory, any letter case), so `files-write`,
`files-edit` and `files-delete` refuse it with the SAFE-2 refusal (exit 2,
no override; its list now reads `(.env* / .git / fledge.toml / .fledge /
.trust.toml / bunfig.toml / specs / *.spec.md / .specsync / keystores)`),
checked on the path as given and where it resolves; `git-commit` SHALL
refuse to stage its deletion, and `discord-send-file` (which checks
`isProtectedPath`) SHALL never attach it. Reads stay allowed, and
`trust.toml`, `.trust.toml.bak` or `docs/trust.md` are not protected.
Corvidinho's own repo has no `.trust.toml`.

Acceptance Criteria
- `isProtectedPath` is true for `.trust.toml`, `./.trust.toml`, `pkg/.Trust.TOML` and an absolute path under the root, and false for `trust.toml`, `docs/trust.md` and `.trust.toml.bak`.
- `files-write` (relative, `./`, absolute, a new `sub/.trust.toml`), `files-edit` and an allowlisted `files-delete` of `.trust.toml` are refused with `refused (SAFE-2)` naming `.trust.toml` (exit 2); the file is unchanged and nothing is created; `files-read .trust.toml` and `files-write trust.toml` work.
- `git-commit` of a deleted tracked `.trust.toml` is refused (exit 2, SAFE-2); it stays in `ls-files` and nothing is staged.
- `discord-send-file`'s `fileAttachment` of `.trust.toml` is refused with `refused (SAFE-2)`.
- `tests/agent.trust-verify.test.ts` fails on the base sources and passes after.

### REQ-plugins-099

It may merge its own Corvidinho PR when verify and CI are green and branch
protection, reviews and CODEOWNERS allow it; it never bypasses them, never
merges someone else's PR, and outside Corvidinho a human still merges
(GITHUB-7, captured in `hi/github.md`). It merges only PRs it opened from its
own talk branches with its own token, and only when I ask; it never marks its
own /work draft ready, won't merge a PR that changes its own gates (.github,
fledge.toml, hi/, AGENTS.md, CODEOWNERS), and counts CI green only when smoke
and spec-sync pass at the head (GITHUB-7.a, captured with `hi` in this change
from Leif's 2026-09-28 interview record, round 16 of 2026-10-06).

`github-pr-merge` SHALL be a dangerous, minTier 1, mutating typed plugin
behind SAFE-1 and GITHUB-6, registered once (`plugins/github/merge.ts`,
`githubPrMerge`), first in `loadGithubPlugins` (`plugins/github/index.ts`),
so no other GitHub command list can take its name. Before the repo gate it SHALL refuse any `--repo`
other than `CorvidLabs/Corvidinho` (`isCorvidinhoRepoSlug` /
`CORVIDINHO_REPO`) with exit 2 and a clear line that outside Corvidinho a
human still merges. It SHALL require the PR author login (and id) to match
`users.getAuthenticated`, the PR to be open, not draft and
`mergeable === true`, and `fetchCiStatus` verdict `green` at its head. On
success it SHALL call `pulls.merge` with method squash and SHALL NOT pass
admin or bypass fields. Dry-run SHALL run the same guards and skip
`pulls.merge`. Logic SHALL live in `plugins/github/merge.ts`
(`checkSelfMerge`, `makeGithubPrMergeCommand(deps)`) so tests inject a fake
Octokit.

On top of that, for GITHUB-7.a, `github-pr-merge` SHALL take `<number>
--repo OWNER/REPO --sha <40-hex head sha>` and optionally `--method squash`
(the only method: `merge` or `rebase` is a usage error) and nothing else (no
draft-ready, admin or bypass option; a usage error is exit 1). `checkSelfMerge(args, env, deps)` SHALL be its gate, re-read in
full on every call, never throwing (a GitHub error, or any other error while
checking — the repo gate, the client — refuses as `github-error`, exit 1, so
the classifier never falls back to a card), and SHALL
refuse with exit 2, `refused (GITHUB-7.a): <why>`, `data.reason` and
`auditDenied` set to the reason code unless every one holds, in this order:
- the caller is the owner's own interactive run (`selfMergeCallerRefusal`):
  not a delegate or council worker (`worker`), not WATCH — a WATCH session
  id or the `watch` surface stamp, the owner's own GitHub-triggered run
  included although IDENTITY-12.a gives it the owner's other tools
  (`watch`) — not a scheduled run, the owner's own included (`schedule`); with no role session
  the local CLI nothing spawned (no Discord session id, no surface stamp, no
  `CORVIDINHO_PROJECT_ROOT`; else `spawned`); in a role session the surface
  stamp is `chat`, `ask`, `session` or `work` (else `surface`) and the role,
  re-resolved now (IDENTITY-12), is the owner (else `not-owner`);
- `--repo` is `CorvidLabs/Corvidinho` (`isCorvidinhoRepoSlug`, no case) — else
  `not-corvidinho`, saying outside Corvidinho a human still merges — and
  passes the GITHUB-6 gate for a write (`repo-gate`); a client exists
  (`no-token`) and the token's own user id and login can be read
  (`token-unknown`);
- the PR is open and not merged (`not-open`), its base repo is Corvidinho
  (`not-corvidinho`), its author id and login are the token's user's
  (`foreign-author`), its head repo is the base repo and its head ref is a
  Corvidinho talk branch (`TALK_BRANCH_RE`,
  `talk/<1-16 of [A-Za-z0-9_-]>-<16 hex>`, as `generateTalkBranchName` names
  it; else `not-own-branch`), it is not a draft (`draft`), its head sha is the
  `--sha` named (`head-moved`), no `ready_for_review` event on it was by
  the token's user (`self-marked-ready`), and the last one (events oldest
  first) was by a person — not the token's user and not an app (actor type
  `Bot` or a `…[bot]` login) — so a PR it opened ready, or one an app marked
  ready last (a person's earlier ready, then a draft again, does not count),
  waits until a human marks it ready (`not-marked-ready`; an event list not
  read whole is `events-truncated`);
- no changed path or a rename's old path is a gate (`selfMergeGatePath`:
  `.github/`, `hi/`, any `fledge.toml`, a `.fledge` folder, any `AGENTS.md`,
  any `CLAUDE.md` (the other project instructions file, AGENT-1), any
  `CODEOWNERS`, any `.trust.toml`, any `bunfig.toml`, any `tsconfig.json`
  (the verify lane's and CI's typecheck config), `.specsync/` outside
  `changes/` and `archive/`, and `SELF_MERGE_CODE`:
  `plugins/github/merge.ts`, `plugins/github/index.ts` (its registration),
  `plugins/github/ciStatus.ts`,
  `plugins/github/api.ts`, `src/agent/repo-ways.ts` (it holds
  `CORVIDINHO_REPO`, the repo it merges in), `src/autonomous/delegate.ts`
  (the worker check), `src/plugins/githubPublic.ts`, `src/plugins/must-ask.ts`,
  `src/plugins/run.ts`, `src/plugins/roles.ts`, `src/agent/shell-gate.ts`,
  `src/approvals/code.ts`, `src/approvals/store.ts`,
  `src/discord/approval-cards.ts`; names without case; else `gate-path`), and the file list was read whole
  (fewer than `changed_files` or 30 full pages is `files-truncated`);
- no reviewer's latest APPROVED / CHANGES_REQUESTED / DISMISSED review is
  CHANGES_REQUESTED (`changes-requested`; a list not read whole is
  `reviews-truncated`);
- for each of `smoke` and `spec-sync` (`SELF_MERGE_CHECKS`, the jobs in
  `ci.yml` and `spec-sync.yml`) the check runs at exactly the head sha from
  the `github-actions` app exist (`ci-<check>-missing`), are all completed
  (`ci-<check>-pending`) and all `success` (`ci-<check>-failed`), and the
  whole CI verdict at that sha (`fetchCiStatus`) is green with no warning
  (`ci-red`, `ci-pending`, `ci-none`, `ci-unread`);
- GitHub reports `mergeable: true` and `mergeable_state` `clean` or
  `has_hooks` (`not-mergeable`), so branch protection, reviews and CODEOWNERS
  allow it now and the merge never leans on an admin bypass.

Its must-ask classifier SHALL run that gate and return `refuse` with its
result (no card) or, when it passes, ask class `merge` (REQ-plugins-097) with
the target `<repo>#<n> at <head sha>` and the squash title as text; a dry run
(`CORVIDINHO_GITHUB_DRY_RUN=1`) asks nothing. After the owner's approval the
handler SHALL run the whole gate again and only then call `pulls.merge` once
with `sha` = the named head, `merge_method: "squash"` (`SELF_MERGE_METHOD`) and `commit_title`
`<PR title> (#<n>)` (`selfMergeCommitTitle`), never an admin or bypass
option; its result SHALL name the merge sha (`Merged PR #<n> "<title>" into
<base> as <sha> (squash, GITHUB-7.a).`, `data.sha`). GitHub not merging, or
answering 405 / 409 / 422, SHALL be a `github-refused` refusal saying nothing
was merged; a run whose signal is aborted by then (stopped after the
Approve, while the gate re-ran) SHALL NOT call `pulls.merge` and SHALL be an
`aborted` refusal (exit 130) saying nothing was merged; a dry run SHALL merge
nothing and return what it would do. Every
attempt SHALL leave SAFE-5 rows (REQ-plugins-095): one `denied` row named
`github-pr-merge:<reason>` for a refusal from the gate or the card (no
`started`), or `started` then `ok`, `error` or `github-pr-merge:<reason>`
`denied` for the handler. Team and community calls stop at the role gate
before the tool (REQ-plugins-065); the owner's own WATCH run passes that
gate (IDENTITY-12.a, REQ-plugins-1201) and is refused by the caller check
with a `github-pr-merge:watch` row. No env var, config key or schema change.

Acceptance Criteria
- Allowlisted merge of an own green open mergeable Corvidinho PR (green under
  GITHUB-7.a, after the owner's Approve) calls `pulls.merge` (squash) with no
  admin or bypass field (`tests/github.self-merge.test.ts`).
- Outside Corvidinho, other author, non-green CI, draft/closed/not-mergeable
  refuse exit 2; dry-run skips merge; SAFE-1 denies without allowlist;
  `plugins list` names `github-pr-merge`.
- `--method squash` is accepted; `--method merge` or `rebase` is a usage error
  (exit 1) before any GitHub call; a PR whose author id matches but whose login
  does not is `foreign-author`.
- With a fake GitHub client, a green PR and an approved card, `runPlugin` merges once with the named head sha, `squash` and `<title> (#12)`, names the merge sha, and leaves `started` then `ok`; the card is kind `mustask-merge`, class destructive, with target `CorvidLabs/Corvidinho#12 at <sha>`.
- On the bridge's real card engine Approve alone merges nothing; Approve plus the one-time code merges once.
- Each refusal — draft, foreign author, non-talk branch, fork head, closed, head moved, self-marked ready, opened ready with no person marking it ready, marked ready only by an app, a gate path (and a rename away from one), a short file list, changes requested, smoke or spec-sync missing, failed, pending, at another commit or from another app, another check failing, blocked, unknown or conflicting mergeability, an unreadable token user — raises no card, merges nothing and leaves one `github-pr-merge:<reason>` `denied` row.
- A non-Corvidinho repo and a bad usage are refused before any GitHub call; WATCH (a WATCH session id, a `watch` stamp, and the owner's own GitHub-triggered run as the WATCH spawn stamps it), a schedule (the owner's own), a worker, a missing surface stamp, a muted owner, team and a spawned local run are refused before any GitHub call; the owner's chat, `/session start`, `/work`, ask answers and the local CLI pass.
- Through `runPlugin`, the owner's own GitHub-triggered WATCH run passes the role gate but is refused with no card, no GitHub call and one `github-pr-merge:watch` `denied` row.
- `.trust.toml` in any folder (any case), `CLAUDE.md` and `tsconfig.json` in any folder, and every `SELF_MERGE_CODE` file (`src/agent/repo-ways.ts`, `src/autonomous/delegate.ts`, `plugins/github/api.ts` and `plugins/github/index.ts` included) are gate paths; `trust.toml`, `docs/trust.md`, `package.json` and `src/agent/tools.ts` are not.
- A person's ready, then a draft again and an app's ready last, is `not-marked-ready`; a person's ready after an app's merges.
- A run stopped after the Approve, while the gate re-runs, merges nothing and leaves `started` then `github-pr-merge:aborted`.
- A PR turned back into a draft while the card waits is refused after the approval (`started`, then `github-pr-merge:draft`), and a denied card leaves `github-pr-merge:card-denied`.
- `loadBuiltins` registers merge.ts's `githubPrMerge` as the one `github-pr-merge`, and no other GitHub command list carries the name; a stray same-named command put first in `githubCommands` still cannot take it.
- An error while checking (a client factory that throws) is refused as `github-pr-merge:github-error` (exit 1) with no card and no merge.
- `tests/github.self-merge.test.ts` fails on the base sources and passes after.

