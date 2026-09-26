---
module: plugins
version: 36
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
  - src/audit/log.ts
  - src/audit/index.ts
  - tests/audit.log.test.ts
  - src/allowlist/types.ts
  - src/allowlist/load.ts
  - src/allowlist/github.ts
  - src/allowlist/discord.ts
  - src/allowlist/index.ts
  - plugins/github/api.ts
  - plugins/github/commands.ts
  - plugins/github/index.ts
  - plugins/github/review.ts
  - tests/github.review.plugin.test.ts
  - plugins/meta/index.ts
  - plugins/specsync/api.ts
  - plugins/specsync/commands.ts
  - plugins/specsync/index.ts
  - plugins/memory/index.ts
  - plugins/memory/commands.ts
  - plugins/files/index.ts
  - plugins/files/commands.ts
  - plugins/files/protectedPaths.ts
  - plugins/files/resolvePath.ts
  - plugins/search/index.ts
  - plugins/search/commands.ts
  - src/memory/confirm.ts
  - tests/memory.plugins.test.ts
  - tests/memory.confirm.test.ts
  - tests/files.plugins.test.ts
  - tests/search.plugins.test.ts
  - plugins/shell/index.ts
  - plugins/shell/commands.ts
  - plugins/shell/clamp.ts
  - tests/shell.plugins.test.ts
db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
and `shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`).

## Invariants

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

`shell-exec` is dangerous + minTier 2 (code). Spawn cwd is pinned to plugin cwd.
Lexical `cd`/`pushd` targets that escape the root are refused before spawn
(SAFE-3) with exit 2. SAFE-1 non-interactive deny applies unless allowlisted.

## Behavioral Examples

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

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape | Refuse (exit 1) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root | Refuse (exit 2, SAFE-3); no spawn |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |

## Change Log

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
| 2026-09-26 | github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200: GitHub PR review reads (issue #93 captured slice, GITHUB-3 / GITHUB-1): read-only github-pr-diff (unified diff capped at 200 KiB with a truncation marker, optional --file PATH filter) and github-pr-files (changed files with status/additions/deletions, paginated to a cap) in plugins/github/review.ts; dangerous false, minTier 0, GITHUB-6 repo gate; SAFE-6 scrub on returned text; diff returned as untrusted data; draft GITHUB-10 confidence score left for HI capture |
