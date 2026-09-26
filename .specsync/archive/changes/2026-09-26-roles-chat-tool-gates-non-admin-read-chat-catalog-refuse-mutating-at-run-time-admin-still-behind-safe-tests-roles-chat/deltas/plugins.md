---
module: plugins
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
---

# Delta — plugins (ROLES-CHAT mutating gates)

## Modified

### SPEC SECTION Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. GitHub write commands (`github-issue-create`, `github-issue-comment`,
`github-pr-create`, `github-pr-review`) are dangerous + minTier 1; SAFE-1
non-interactive deny unless CORVIDINHO_ALLOWLIST names them. Repo gate
(GITHUB-6 / ALLOW-1) still applies before any Octokit write. PR create appends
plain Made with Corvidinho attribution (no @handles). Dry-run via
CORVIDINHO_GITHUB_DRY_RUN=1. File write/edit/delete require minTier 2 (code);
`files-delete` is dangerous. Paths clamp to plugin cwd; symlink escapes refuse.
Protected infra (`.env*`, `.git`, `fledge.toml`, `specs/**` / `*.spec.md`,
keystore basenames) cannot be overwritten or deleted via file tools (SAFE-2);
no in-band override. Memory plugins take the acting user and ADMIN
only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID` /
`CORVIDINHO_ACTING_IS_ADMIN`), never argv — `--user` / `--admin` / `--db` are
refused; ADMIN is re-checked in the handler (empty admin lists ⇒ nobody);
`memory-forget` / `memory-override` are two-phase with an HMAC confirm token
confirmed from a different turn (SAFE-4 / REQ-plugins-011).
Memory plugin command descriptions SHALL include concrete argv examples so the
LLM tool loop can call them (REQ-plugins-085). OpenAI tool schema argv text for
`memory-*` is enriched similarly in `buildOpenAiTools`.
Git plugins (REQ-plugins-182) spawn `git` with argv arrays only (no shell),
stdin closed, `GIT_TERMINAL_PROMPT=0`, hooks disabled, repo-locating env
stripped and `GIT_CEILING_DIRECTORIES` at the cwd's parent; the plugin cwd
must be the repository / worktree top level (SAFE-3). Flags are strict
(unknown refused); path args use the files-plugin clamp and go after `--` as
literal pathspecs. Hooks stay off even with a repo-local `core.hooksPath`, and
a linked worktree top level (`.git` file) is a valid cwd. `git-status` lists
untracked files individually (`--untracked-files=all`) so they feed
`git-commit`. `git-branch-create` switches with `--no-overwrite-ignore` so an
ignored `.env*` / keystore is never replaced by a start point's tracked copy
(SAFE-2). Reads are `dangerous: false`, minTier 0. `git-branch-create`,
`git-commit` and `git-push` are dangerous + minTier 2. `git-commit` needs a
message, stages explicit file paths only (no directories / `--all` / amend),
commits only those paths (`--only`), refuses `.env*` / keystore / `.git`
paths and staging the deletion of SAFE-2 protected infra, and reports
`filesChanged`. `git-push` pushes only the current branch to the same-named
ref of a configured remote (never a URL), never forces, gates every push
URL's OWNER/REPO through `checkRepoGate` with the allowlist file + env
(GITHUB-6, deny wins), and redacts URL credentials / secret tokens. Draft
SAFE-22 default-branch policy is not enforced (awaiting HI).

`shell-exec` is dangerous + minTier 2 (code). Spawn cwd is pinned to plugin cwd.
Lexical `cd`/`pushd` targets that escape the root are refused before spawn
(SAFE-3) with exit 2. SAFE-1 non-interactive deny applies unless allowlisted.


File write/edit are `mutating: true` even when `dangerous: false` (ROLES-CHAT-5).
When `CORVIDINHO_ACTING_IS_ADMIN` is set (Discord/WATCH/schedule acting session),
non-ADMIN callers are refused for every mutating plugin at run time with a
"not allowed for your role" error (ROLES-CHAT-3/6); ADMIN still passes SAFE-1
for dangerous tools. Role is re-checked via owner config each call.

### SPEC SECTION Behavioral Examples

### Scenario: memory-store description shows argv example

- **Given** builtins are loaded
- **When** an operator or the tool loop inspects `memory-store`
- **Then** the description includes `--category` / `person` / `identity` example argv

### Scenario: SAFE-3 refuse cd outside root

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `shell-exec` with `cd /tmp && pwd`
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn outside root

### Scenario: relative cd inside root

- **Given** a project with subdirectory `sub`
- **When** `shell-exec` runs `cd sub && …` allowlisted
- **Then** the command runs with initial cwd at project root and succeeds if the subcommand does

### Scenario: git-push refuses a repo off the allowlist

- **Given** the task worktree's `origin` points at OWNER/REPO not on the GitHub allowlist
- **When** the tool loop runs `git-push` (allowlisted as a dangerous command)
- **Then** the run fails with a GITHUB-6 error (exit 3) and nothing is pushed


### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

### SPEC SECTION Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape | Refuse (exit 1) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root | Refuse (exit 2, SAFE-3); no spawn |
| git plugin cwd not a repo top level | Refuse (exit 2, SAFE-3) |
| git-commit stages protected delete / `.env*` / keystore / `.git` | Refuse (exit 2) |
| git force / amend / `--all` / refspec / other-branch push | Refuse (exit 2) |
| git-branch-create switch would overwrite an ignored / untracked local file (e.g. `.env`) | Refuse (exit 2, SAFE-2); HEAD and files unchanged |
| git-push remote OWNER/REPO not allowlisted or denied | Refuse (exit 3, GITHUB-6) |
| git-push non-fast-forward | Fail (exit 1); never retried with force |

### SPEC SECTION Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26). Historical
and current rows for plugins host evolution.

| 2026-09-26 | github-write-plugins-issue-48: dangerous issue/PR create comment review + attribution; SAFE-1 + GITHUB-6 |
| 2026-09-26 | memory-sqlite-acl issues #41 #59: MEMORY SQLite + ACL; package 0.0.4 |
| 2026-09-26 | plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81: files-read/write/edit/glob/list/delete + search-grep; SAFE-2 protected paths; path clamp; package 0.0.6 |
| 2026-09-26 | cover-leftover-plugins-list-smoke-test-ts-for-specsync-audit-after-files-search-81-archive: Cover leftover plugins.list.smoke.test.ts for SpecSync audit after files/search #81 archive |
| 2026-09-26 | memory-discord-inject: richer memory-* argv descriptions (REQ-plugins-085) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge: Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env |
| 2026-09-26 | safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by: SAFE-5 tamper-evident audit trail (issue #95 captured slice): append-only audit_log (schema v5, UPDATE/DELETE blocked by triggers) with an HMAC-SHA256 chain keyed by CORVIDINHO_AUDIT_HMAC_KEY from the bot VM env (plain SHA-256 integrity chain when unset); runPlugin records every dangerous plugin run (started then ok/error, fail closed if the intent cannot be recorded) and denied close calls, storing action, actor, surface, args digest and outcome, never raw args; verify at bridge start and a chain-status line in /status; busy_timeout on the shared DB; tests isolate the data dir; draft SAFE-17 Discord verify command left for HI capture |
| 2026-09-26 | memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory: Memory plugins treat the configured owner as ADMIN (IDENTITY-1, #42 companion): the handler-time ADMIN re-check for memory forget/override/include-deleted also accepts the owner's Discord snowflake from the owner config, still requiring the bridge's per-dispatch admin bit and never for muted or deny-listed owners |
| 2026-09-26 | shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9: shell-exec + SAFE-3 cwd clamp; package 0.0.9 |
| 2026-09-26 | strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner: Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set |
| 2026-09-26 | plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6: git-status/diff/log/branch-list reads + dangerous code-tier git-branch-create/commit/push; cwd clamped to the worktree top level, explicit-path commits, never force, GITHUB-6 push gate (issue #82, REQ-plugins-182); draft SAFE-22 left for HI |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2..6 mutating role gates |

## Added

### REQUIREMENT REQ-plugins-roles-001

Plugin commands MAY declare `mutating: true`. `isMutatingPlugin` SHALL treat
`dangerous: true` OR `mutating: true` as mutating. `files-write` and
`files-edit` SHALL set `mutating: true`.

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` asserts files-write/edit mutating and non-admin refuse.

### REQUIREMENT REQ-plugins-roles-002

When `CORVIDINHO_ACTING_IS_ADMIN` is present in the environment, `runPlugin`
SHALL refuse mutating plugins unless `resolveActingIsAdmin` returns true
(owner re-check). Refusal message SHALL include "not allowed for your role".

Acceptance Criteria
- Non-admin refuses files-write/shell/github-pr-create/memory-forget.
- Admin reaches files-write; shell still SAFE-1 without allowlist.
