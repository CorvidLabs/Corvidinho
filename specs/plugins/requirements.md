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

Acceptance Criteria
- File path env and default home config paths are consulted.
- Env overlays (e.g. `CORVIDINHO_GITHUB_ALLOW_REPOS`) merge over file.

### REQ-plugins-007

The system SHALL expose a Discord allowlist stub API (channel/role/user) for future HEAR (#5) without implementing the full Discord bridge.

Acceptance Criteria
- Exported `checkChannel` / `checkRole` / `checkUser` (or equivalent) honor default-deny + deny override.
- No Discord gateway/bridge process in this change.


### REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

Acceptance Criteria
- `plugins list` includes the SpecSync command names.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- `specsync-brief <module>` returns companion files when present.


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
resolutions that leave the root SHALL be refused.

Acceptance Criteria
- Escape and symlink-outside-root fixtures refuse with a clear error.

### REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, paths under `specs/` or ending in `.spec.md`, and
keystore-like basenames (`*keystore*`, `wallet-keystore.json`).

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.

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
(ADMIN-4 / DISCORD-7): empty `CORVIDINHO_DISCORD_ADMIN_USERS` and
`CORVIDINHO_DISCORD_ADMIN_ROLES` ⇒ nobody is ADMIN even when
`CORVIDINHO_ACTING_IS_ADMIN=1` (MEMORY-ACL-4). The bridge's per-dispatch
`CORVIDINHO_ACTING_IS_ADMIN=1` is required on every path (a scheduled run
spawned with it off never gets ADMIN), and the live config must agree:
deny-listed or muted users are never ADMIN; a user id in the admin users list
is ADMIN; otherwise only when admin roles are configured. Self-forget stays
ADMIN-only.
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
- Empty admin lists + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused.
- Admin user id without the bridge bit (scheduled runs) refused; deny-listed or muted admin refused; role admin needs roles configured + env bit.
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

Acceptance Criteria
- Allowed dangerous run appends started + ok rows; raw args are not stored.
- Non-interactive denial appends a denied row; safe plugins append nothing.
- A dangerous run is refused when its started row cannot be written.
- Tampering is detected at the first bad row; wrong/missing key fails verify.

### REQ-plugins-042

The memory plugins' handler-time ADMIN re-check (REQ-plugins-011) SHALL treat
the configured owner (IDENTITY-1; matched by Discord snowflake from the owner
env or the allowlist `[owner]` section) as ADMIN, under the same conditions as
the bridge: the per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` bit is still
required, and a muted or deny-listed owner is not ADMIN. With no owner and
empty admin lists nobody is ADMIN.

Acceptance Criteria
- Owner + bridge bit may run memory forget phase 1 with empty admin lists.
- Owner without the bit, a non-owner id, and a muted owner are refused.
