---
module: plugins
version: 44
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/mutating.ts
  - src/plugins/roles.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
  - src/plugins/githubPublic.ts
  - tests/github.public.community.test.ts
  - tests/github.gate-allowlist-file.test.ts
  - tests/files.secret-path.test.ts
  - src/audit/log.ts
  - src/audit/index.ts
  - tests/audit.log.test.ts
  - src/allowlist/types.ts
  - src/allowlist/load.ts
  - src/allowlist/github.ts
  - src/allowlist/discord.ts
  - src/allowlist/index.ts
  - tests/allowlist.toml-multiline.test.ts
  - plugins/github/api.ts
  - plugins/github/commands.ts
  - plugins/github/ciStatus.ts
  - tests/github.ci-status.test.ts
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
  - plugins/files/argv.ts
  - plugins/search/index.ts
  - plugins/search/commands.ts
  - src/memory/confirm.ts
  - tests/memory.plugins.test.ts
  - tests/memory.confirm.test.ts
  - tests/files.plugins.test.ts
  - tests/files.dangling-symlink.test.ts
  - tests/search.plugins.test.ts
  - tests/plugins.argv-dashes.test.ts
  - plugins/shell/index.ts
  - plugins/shell/commands.ts
  - plugins/shell/clamp.ts
  - tests/shell.plugins.test.ts
  - tests/shell.clamp-bypass.test.ts
  - tests/shell.clamp-failclosed.test.ts
  - tests/shell.clamp-quoting.test.ts
  - plugins/web/index.ts
  - plugins/web/commands.ts
  - plugins/web/fetch.ts
  - plugins/web/address.ts
  - plugins/web/transport.ts
  - plugins/web/text.ts
  - tests/web.fetch.test.ts
  - tests/web.transport.test.ts
  - plugins/git/index.ts
  - plugins/git/commands.ts
  - plugins/git/exec.ts
  - plugins/git/parse.ts
  - tests/git.plugins.test.ts
  - plugins/autonomous/index.ts
  - plugins/autonomous/commands.ts
  - plugins/autonomous/council.ts
  - tests/autonomous.delegate.test.ts
  - tests/autonomous.council.test.ts
  - plugins/fledge/index.ts
  - plugins/fledge/discover.ts
  - plugins/fledge/commands.ts
  - plugins/fledge/spawn.ts
  - src/plugins/toolCost.ts
  - tests/fledge.plugins.test.ts
  - tests/fledge.cli.test.ts
  - tests/fledge.hardening.test.ts
  - src/plugins/proc-group.ts
  - tests/proc-group.test.ts
  - tests/roles.chat.gates.test.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
`shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088), the
SSRF-guarded `web-fetch` GET plugin (PLUGIN-1/2 / SAFE-7 / REQ-plugins-111), and
typed git plugins (`git-status|diff|log|branch-list` reads;
`git-branch-create|commit|push` dangerous code-tier mutators) clamped to the
task worktree (PLUGIN-1/2, SAFE-1/2/3, GITHUB-2/6 / REQ-plugins-182).
Autonomous extras are plugins left off until the project opts in (PLUGIN-5):
`delegate` hands a subtask to a worker agent (AUTONOMOUS-5 / REQ-plugins-117);
`council` convenes worker voices that propose, critique and decide
(AUTONOMOUS-6 / REQ-plugins-118).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`). Git plugins
register via `loadGitPlugins` (`plugins/git/index.ts`).
`plugins/web` registers `web-fetch` via `loadWebPlugins`; `createWebCommands`
takes the resolver/transport seams, `webFetch` is the guarded GET core,
`checkAddress` classifies one IP, and `createSocketTransport` is the pinned
HTTP/1.1 socket transport. Autonomous plugins
register via `loadAutonomousPlugins` (`plugins/autonomous/index.ts`);
`createDelegateCommand(deps)` builds `delegate` with an injectable env, bin,
limiter and timeout; `createCouncilCommand(deps)` builds `council` with an
injectable env, bin, limiter, council timeout and per-voice timeout.
`PluginCommand.autonomous?: boolean`;
`PluginHandlerArgs.tier?` / `signal?` and matching `runPlugin` options.
`src/plugins/proc-group.ts` (REQ-plugins-154) exports `killProcessTree`,
`signalProcessTree`, `collectProcessTree`, `readProcTable`, `parseProcStat`,
`trackChildProcess(pid, known?)` (the `KnownMembers` exit-snapshot getter),
`trackedChildProcesses`, `ignoredSignals` (`SigIgn` mask parse) and
`forwardedSignals` (hooked signals, minus those ignored at load) for children
spawned with `detached: true`. The registry exports `unregister(name, command)` (removes a
name only while it is still that exact command). `plugins/fledge` exports
`fledgeRunArgv` and `fledgeBindings`; `fledgePluginCommand` takes the project
root it binds to, and `runFledgeCommand` / `spawnCapped` take `signal`.

## Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. GitHub write commands (`github-issue-create`, `github-issue-comment`,
`github-pr-create`, `github-pr-review`) are dangerous + minTier 1; SAFE-1
non-interactive deny unless CORVIDINHO_ALLOWLIST names them. Repo gate
(GITHUB-6 / ALLOW-1) still applies before any Octokit write. PR create appends
plain Made with Corvidinho attribution (no @handles). Dry-run via
CORVIDINHO_GITHUB_DRY_RUN=1. File write/edit/delete require minTier 2 (code);
`files-delete` is dangerous. Paths clamp to plugin cwd; symlink escapes refuse;
a dangling symlink is followed by hand and its target clamped (loops refuse).
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
`web-fetch` is dangerous + minTier 1 (tool): SAFE-1 consent applies (left out
of the default tool catalog, non-interactive deny unless CORVIDINHO_ALLOWLIST
names it, SAFE-5 audit) until community-role web gating (#65) and the
untrusted-content rules (#71) are captured. GET only, http/https only, no URL
credentials, and no URL (first hop or redirect) carrying a value
`scrubSecrets` would redact, raw or percent-decoded, so vendor-key-shaped
values never leave in a URL. Loopback, private, CGNAT, link-local (incl. cloud
metadata), unique-local, multicast, unspecified, `0.0.0.0/8`,
reserved/documentation and IPv4-mapped / NAT64 forms of those are refused after
DNS and before any connection; any non-public address in an answer refuses the
whole name. The socket dials only checked IP literals (no DNS, no proxy), in
answer order, trying the next checked address only after a socket-level
connect error, while Host and TLS SNI keep the original name and the
certificate is verified against it. Redirects are followed manually (max 5)
and every hop repeats the check. The body is capped at 1 MiB and the returned
text at 100,000 chars (truncated, flagged with `truncatedBy`), the whole call
at 15 s; non-text or malformed (not an RFC 6838 `type/subtype` token) content
types and compressed bodies are refused. Returned text has C0/C1 controls
stripped (newline and tab kept), is secret-scrubbed and is fenced as untrusted
data with a per-call random marker id; the page title is a `Title:` line
inside the fence, never a separate field. Errors never echo the reason phrase
or other server-chosen header values and are one line, control-free and at
most 300 chars. `web-search` is not built (provider not captured).
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

`delegate` (REQ-plugins-117) is `dangerous: false`, `mutating: true`, minTier
2, `autonomous: true`: hidden from the tool catalog unless the session is
allowed (SAFE-9), never offered to or run for a non-ADMIN role session
(ROLES-CHAT-2/3/5, a worker runs tools), and its handler re-checks at run
time, in order, usage (exit 1), the
AUTONOMOUS-1 project switch, the depth cap, a code-tier lead, and the
concurrency / per-run budget (exit 2, nothing spawned). It returns the
worker's skill, tier, depth, state, summary and filesChanged.

Fledge commands (REQ-plugins-112/113) run `fledge plugins run <command> --
<argv...>`, are bound to the project root they were discovered for (another
root's load rebinds or removes them; a call from another cwd is refused), and
run in their own process group so a timeout or abort stops the whole tree.
Bounded children (Fledge runs, delegate workers, spawned schedule/chat runs)
never outlive their limit or this process (REQ-plugins-154).

`council` (REQ-plugins-118) declares the same flags as `delegate`
(`dangerous: false`, `mutating: true`, minTier 2, `autonomous: true`) and
re-checks the same gates in the same order (usage exit 1; AUTONOMOUS-1,
top-level lead only (depth 0: a delegated worker is refused), code-tier lead,
council budget exit 2, nothing spawned). One council runs
at a time and at most 2 per lead run. Its voices are delegate-core workers at
read tier by default (tool at most), non-ADMIN, with an empty allowlist. It
returns the voice count, tier, depth, state, decision, phase tallies and a
bounded transcript; ok only when the chair decided.

`shell-exec` is dangerous + minTier 2 (code). Spawn cwd is pinned to plugin cwd.
Lexical `cd`/`pushd` targets that escape the root are refused before spawn
(SAFE-3) with exit 2, and the clamp fails closed on anything it cannot resolve
to an in-root target. It tokenizes the way the shell reads a command: quoted
and backslash-escaped text joins into one word (quoted separators are not
separators; quotes and backslashes are removed before checking), a
`\`-newline outside single quotes is a continuation (an escaped `\` before a
newline is not), `#` at a word start comments to the end of the line, and a
`$(…)` ends where those same rules say. A command with `<<` is checked both as
dash reads it (the here-doc body is data; only an unquoted one's `$(…)` /
backticks are analysed) and as bash may read it (`(( x << 2 ))` is arithmetic,
so the lines after it are commands), and refuses if either does; so is each
`eval` argument. A `cd` / `pushd` left open by an unterminated quote or a
trailing `\` refuses, as does a command nested too deeply to check. It looks past prefix words (`{ } ! if
then else elif do while until time builtin command`, `function NAME`) and
`NAME=value` / `NAME+=value` assignments, drops redirections (with their
targets and any `fd` prefix such as `2>&1`, never splitting on a redirection
`&`) and skips `cd` options (`-P -L -e -@ -n --`). It refuses `cd -`, a target
the shell would expand (`$`, backtick, glob, brace), a command word that would
expand, an `eval` with an expanded argument, escaping `cd` inside a command
substitution (`$(…)` / backticks), and `DIRSTACK` writes. CDPATH is not refused
lexically: the child shell runs `CDPATH=; readonly CDPATH` and does not inherit
`CDPATH` or `OLDPWD`, so a `CDPATH` set (even dynamically) in the command cannot
redirect a relative `cd`. SAFE-1 non-interactive deny applies unless allowlisted.


File write/edit are `mutating: true` even when `dangerous: false` (ROLES-CHAT-5).
When `CORVIDINHO_ACTING_IS_ADMIN` is set (Discord/WATCH/schedule acting session),
non-ADMIN callers are refused for every mutating plugin at run time with a
"not allowed for your role" error (ROLES-CHAT-3/6); ADMIN still passes SAFE-1
for dangerous tools. Role is re-checked via owner config each call.

Non-ADMIN role sessions (`CORVIDINHO_ACTING_IS_ADMIN` set and not admin) may
call GitHub read tools against any *public* repository after deny-list checks
(ROLES-CHAT-8). Private or unknown visibility is refused. ADMIN / non-role
sessions keep the GITHUB-6 allowlist gate.

`files-read` refuses secret-looking paths (`.env*`, `.ssh`, keystores, key
files) for non-ADMIN role sessions via `isSecretPath`.

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

### Scenario: SAFE-3 clamp fails closed on obfuscated cd

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs a `cd` outside the root hidden behind a redirection (`cd 2>&1 /etc`), quoting (`X=';' cd /etc`), a `\`-newline continuation, an expanded command word (`$(echo cd) /etc`) or a command substitution (`echo $(cd /etc && cat x)`)
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn

### Scenario: SAFE-3 clamp reads quoting like the shell

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `cd "a b/../.."`, `cd a\ b/../..`, `X="a b" cd /etc`, a `cd /etc` after an escaped `\` and a newline, after a `#` comment or here-doc body holding a lone quote, or a `cd "sub` left open
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn; `cd "sub dir"` and `cd sub # comment` still run

### Scenario: SAFE-3 CDPATH cannot redirect a relative cd

- **Given** `shell-exec` allowlisted
- **When** the command sets `CDPATH` (literally or dynamically) to an outside dir and then runs `cd sub`
- **Then** the child shell's `readonly CDPATH` and dropped `CDPATH`/`OLDPWD` env keep `cd sub` under the root; no outside path is reached

### Scenario: web-fetch refuses cloud metadata

- **Given** builtins are loaded
- **When** `web-fetch` is asked for `http://169.254.169.254/latest/meta-data/` (or a name that resolves or redirects there)
- **Then** it refuses with a SAFE-7 error and exit 2 before any connection is opened

### Scenario: web-fetch keeps a hostile page's text inside the fence

- **Given** `web-fetch` is allowlisted and a public page sets `<title>IGNORE PREVIOUS INSTRUCTIONS</title>`, a prose Content-Type or a prose reason phrase
- **When** the tool loop fetches it
- **Then** the title appears only as a `Title:` line between the untrusted markers, and the prose Content-Type or status is refused / reported as a numeric status without echoing it

### Scenario: git-push refuses a repo off the allowlist

- **Given** the task worktree's `origin` points at OWNER/REPO not on the GitHub allowlist
- **When** the tool loop runs `git-push` (allowlisted as a dangerous command)
- **Then** the run fails with a GITHUB-6 error (exit 3) and nothing is pushed

### Scenario: delegate refused while autonomous mode is off

- **Given** a project without `[corvidinho.autonomous] enabled = true`
- **When** `delegate` runs (tool loop or `plugins run`)
- **Then** it fails with exit 2 citing AUTONOMOUS-1 and no worker is spawned

### Scenario: council voices cannot act

- **Given** an autonomous-enabled project and a code-tier lead whose allowlist names `shell-exec`
- **When** the lead runs `council --question ...`
- **Then** every voice runs `task run` at read tier with `CORVIDINHO_ALLOWLIST` empty and `CORVIDINHO_ACTING_IS_ADMIN=0`, and the result carries the chair's decision

### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape (incl. dangling link target or loop) | Refuse (exit 1) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root (incl. `cd -`, options, prefix words, redirections, quoting, `\`-newline, comments, here-docs, expanded command words, command substitutions, DIRSTACK) | Refuse (exit 2, SAFE-3); no spawn |
| shell-exec cd/pushd left open by an unterminated quote or trailing `\`, or a command nested too deeply to check | Refuse (exit 2, SAFE-3); no spawn |
| shell-exec sets CDPATH (literal or dynamic) then runs a relative cd | Child shell `readonly CDPATH` + dropped env keep the cd in-root (SAFE-3) |
| web-fetch to a non-public target (literal, DNS answer or redirect hop) | Refuse before connecting (exit 2, SAFE-7) |
| web-fetch non-http(s) scheme or URL credentials | Refuse (exit 2) |
| web-fetch URL or redirect carrying a secret-looking value | Refuse before DNS (exit 2, SAFE-6) |
| web-fetch non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| web-fetch > 5 redirects | Refuse (exit 2) |
| web-fetch non-text or malformed content-type / compressed body / non-2xx / timeout / every checked address unreachable | Error (exit 1); nothing returned |
| git plugin cwd not a repo top level | Refuse (exit 2, SAFE-3) |
| git-commit stages protected delete / `.env*` / keystore / `.git` | Refuse (exit 2) |
| git force / amend / `--all` / refspec / other-branch push | Refuse (exit 2) |
| git-branch-create switch would overwrite an ignored / untracked local file (e.g. `.env`) | Refuse (exit 2, SAFE-2); HEAD and files unchanged |
| git-push remote OWNER/REPO not allowlisted or denied | Refuse (exit 3, GITHUB-6) |
| git-push non-fast-forward | Fail (exit 1); never retried with force |
| delegate while autonomous off / depth cap / below code tier / budget spent | Refuse (exit 2); nothing spawned |
| delegate from a non-ADMIN role session (ROLES-CHAT-3) | Refuse (exit 2, not allowed for your role); nothing spawned |
| delegate worker fails or times out | ok=false with worker exit / state and scrubbed summary |
| council while autonomous off / depth cap / below code tier / council budget spent | Refuse (exit 2); nothing spawned |
| council from a non-ADMIN role session (ROLES-CHAT-3) | Refuse (exit 2, not allowed for your role); nothing spawned |
| council chair fails / fewer than 2 proposals | ok=false (exit 1) with the transcript |
| council time cap or lead abort | ok=false (exit 130), state cancelled, voices stopped |
| fledge-* called from a cwd other than its bound project root | Refuse (exit 2); fledge not started |
| fledge-* times out / calling run aborts | exit 124 / 130; plugin process tree killed |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |
| node:dns / net / tls | web-fetch resolve once, dial pinned IP, SNI + cert check |
| src/store/scrub.ts | `scrubSecrets` on web-fetch output and errors; secret-bearing URLs refused |
| git (system binary) | git plugins via `Bun.spawn` argv arrays |
| /proc (Linux) | process-tree walk for bounded child stops (proc-group) |

## Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26). Historical
and current rows for plugins host evolution.

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: ROLES-CHAT-8 community public GitHub gate + secret-path read refuse |
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
| 2026-09-26 | web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http: Web-fetch plugin, SSRF-guarded (issue #111, PLUGIN-1/2, SAFE-7): new plugins/web with one GET-only web-fetch command; http/https only; DNS resolved and every address checked against loopback, private, CGNAT, link-local/metadata, unique-local, multicast, unspecified, reserved and IPv4-mapped/NAT64 forms; the checked IP is pinned for the socket while Host and SNI keep the original name; redirects followed manually (max 5) and re-checked per hop; 1 MiB body and 15s total caps; text content types only; output control-stripped, scrubbed and fenced as untrusted data (title inside the fence, no echo of server text); URLs carrying secrets refused; 100k-char text cap; dangerous true (SAFE-1 consent), minTier 1; web-search left for HI capture |
| 2026-09-26 | plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6: git-status/diff/log/branch-list reads + dangerous code-tier git-branch-create/commit/push; cwd clamped to the worktree top level, explicit-path commits, never force, GITHUB-6 push gate (issue #82, REQ-plugins-182); draft SAFE-22 left for HI |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117: `delegate` autonomous plugin (PLUGIN-5, AUTONOMOUS-5, SAFE-9), `PluginCommand.autonomous`, handler tier + signal pass-through (REQ-plugins-117) |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho: AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2..6 mutating role gates |
| 2026-09-26 | web-fetch-htmltotext-strips-tags-to-a-capped-fixpoint-so-split-tags-cannot-reassemble-codeql-incomplete-multi-character: Web-fetch htmlToText strips tags to a capped fixpoint so split tags cannot reassemble (CodeQL incomplete multi-character sanitization on #148) |
| 2026-09-26 | github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured: github-ci-status takes a PR number or a ref (branch/tag/SHA; git ref-name validation, option-looking refused) and reports verdict green/red/pending/none over check runs plus legacy commit statuses; rows keep name/state/bucket/link (REQ-plugins-094, GITHUB-4 / #94 captured slice; draft GITHUB-11 left for HI capture) |
| 2026-09-26 | github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200: GitHub PR review reads (issue #93 captured slice, GITHUB-3 / GITHUB-1): read-only github-pr-diff (unified diff capped at 200 KiB with a truncation marker, optional --file PATH filter) and github-pr-files (changed files with status/additions/deletions, paginated to a cap) in plugins/github/review.ts; dangerous false, minTier 0, GITHUB-6 repo gate; SAFE-6 scrub on returned text; diff returned as untrusted data; draft GITHUB-10 confidence score left for HI capture |
| 2026-09-26 | spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run: Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1) |
| 2026-09-26 | files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2: Files path clamp follows dangling symlinks by hand so files-write cannot escape the project root or create SAFE-2 protected files through a link whose target does not exist yet |
| 2026-09-26 | harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml: Harden /admin and github-pr-diff edges: /admin mutations fail closed when no audit trail is wired, allowlist JSON/TOML detection shares the loader rule, dangling allowlist symlinks are refused not replaced, empty --file is a usage error, pure rename/copy/mode changes say content unchanged and copies get copy from/to lines |
| 2026-09-26 | council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2: Council tool (issue #118, AUTONOMOUS-6, SAFE-9): a code-tier lead in an autonomous-enabled project can convene a council of 2-5 delegated voices that deliberate in structured phases (propose, critique, decide) and get back a bounded transcript and a synthesized decision; voices run read tier by default with no mutating tools, reuse delegate caps and worker env stripping, and the tool stays hidden unless the session is allowed |
| 2026-09-26 | plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep: Plugin argv keeps tokens that start with -- (files-write content, files-edit strings, shell-exec command flags, search-grep patterns) and files-write refuses to empty a non-empty file without --allow-empty |
| 2026-09-26 | github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists: GitHub plugin repo gate reads the allowlist file plus env overlays so file deny lists apply and file-only allow lists work (GITHUB-6, ALLOW-4) |
| 2026-09-26 | files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file: Files-edit single-occurrence replace writes --new literally so dollar replacement patterns cannot corrupt the file (plugins-exec-5) |
| 2026-09-26 | test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a: Test suite never reads the operator allowlist file (preload and custom-env tests point CORVIDINHO_ALLOWLIST_FILE at a missing file) and a malformed allowlist file makes the GitHub plugin gate refuse (REQ-plugins-253) |
| 2026-09-26 | shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops: Shell-exec SAFE-3 cd clamp skips cd options, prefix words and quoting, refuses cd -, expansions and CDPATH jumps, and drops inherited CDPATH/OLDPWD so shell-exec cannot run outside the project root |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |

| 2026-09-26 | safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded: SAFE-3 shell-exec cd clamp fails closed — quote-aware tokenizer joins `\`-newlines, drops redirections (never splitting a redirection `&`), refuses expanded command words, `eval` with expansion, escaping cd inside command substitutions and DIRSTACK writes; CDPATH protection moves to the child shell's `CDPATH=; readonly CDPATH` (dropped CDPATH/OLDPWD env) so a dynamic CDPATH cannot redirect a relative cd; closes PR #187 review findings |
| 2026-09-26 | allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped |
| 2026-09-27 | safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here: SAFE-3 shell-exec cd clamp reads quoting the way the shell does: escaped backslash before a newline, comments and here-doc bodies no longer hide a cd, the end of a command substitution is found with the same tokenizer, and a cd/pushd command left open by a quote or trailing backslash is refused |
