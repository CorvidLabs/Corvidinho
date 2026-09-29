---
module: plugins
version: 52
status: draft
files:
  - plugins/discord/user-lookup.ts
  - tests/discord.user-lookup.test.ts
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
  - tests/search.secret-path.test.ts
  - src/audit/log.ts
  - src/audit/index.ts
  - tests/audit.log.test.ts
  - tests/store.busy-lock.test.ts
  - tests/audit.keyed-downgrade.test.ts
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
  - plugins/github/public-docs.ts
  - tests/github.public-docs.test.ts
  - plugins/meta/index.ts
  - plugins/specsync/api.ts
  - plugins/specsync/commands.ts
  - plugins/specsync/index.ts
  - tests/specsync.path-containment.test.ts
  - tests/specsync.check-parity.test.ts
  - tests/specsync.registry-fallback.test.ts
  - plugins/memory/index.ts
  - plugins/memory/commands.ts
  - plugins/files/index.ts
  - plugins/files/commands.ts
  - plugins/files/protectedPaths.ts
  - plugins/files/resolvePath.ts
  - plugins/files/argv.ts
  - plugins/files/image.ts
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
  - plugins/runners/index.ts
  - plugins/runners/commands.ts
  - tests/runners.plugins.test.ts
  - tests/shell.clamp-scripts.test.ts
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
  - plugins/fledge/core.ts
  - src/plugins/toolCost.ts
  - tests/fledge.plugins.test.ts
  - tests/fledge.cli.test.ts
  - tests/fledge.hardening.test.ts
  - tests/fledge.core.test.ts
  - src/plugins/proc-group.ts
  - tests/proc-group.test.ts
  - tests/roles.chat.gates.test.ts
  - tests/roles.team.test.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
`shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088),
language runners `node-exec` / `python-exec` / `cargo-exec` that register only
when their toolchain is on PATH (PLUGIN-4 / REQ-plugins-313..314), the
SSRF-guarded `web-fetch` GET plugin (PLUGIN-1/2 / SAFE-7 / REQ-plugins-111), and
typed git plugins (`git-status|diff|log|branch-list` reads;
`git-branch-create|commit|push` dangerous code-tier mutators) clamped to the
task worktree (PLUGIN-1/2, SAFE-1/2/3, GITHUB-2/6 / REQ-plugins-182), and
Fledge itself as typed builtins (`fledge-lanes-list|lanes-validate` reads;
`fledge-lanes-run` / `fledge-run` dangerous code-tier runs of the project's
own lanes and tasks; PLUGIN-1/2 / REQ-plugins-461), next to the bridge that
offers the project's Fledge plugins as `fledge-<command>` (PLUGIN-3 /
REQ-plugins-112..113).
Autonomous extras are plugins left off until the project opts in (PLUGIN-5):
`delegate` hands a subtask to a worker agent (AUTONOMOUS-5 / REQ-plugins-117);
`council` convenes worker voices that propose, critique and decide
(AUTONOMOUS-6 / REQ-plugins-118).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`). Language
runners register via `loadRunnerPlugins(env?)` (`plugins/runners/index.ts`),
which returns a `RunnerLoadReport` (`loaded` with each bound binary, `missing`
with a reason) that `runnerStatusLines` renders for `plugins list`;
`resolveRunnerBin`, `RUNNERS`, `runnerCommand(spec, bin)`, `runRunner` and
`runnerChildEnv` are exported for tests. Git plugins
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
`plugins/fledge/core.ts` (re-exported from `plugins/fledge/index.ts`) registers
the Fledge core builtins via `loadFledgeCorePlugins(opts?)` (called by
`loadBuiltins`; a name already registered is left as is) and exports
`fledgeCoreCommands(opts?)` (test seams: `env`, `readTimeoutMs`,
`runTimeoutMs`, `maxOutputBytes`), `FLEDGE_CORE_COMMAND_NAMES`,
`FLEDGE_NAME_RE`, `resolveFledgeBin(env)`, `fledgeCoreChildEnv(base, root)`,
`laneSourcesRefusal(cwd)`, `parseLanesList` and `parseLanesValidate`.
`plugins/specsync/api.ts` exports `listRegisteredModules` (in a project that
has a `.specsync/` dir, each `specs/<name>/<name>.spec.md` that
`readModuleSpec` reads, plus the `[specs]` names of `.specsync/registry.toml`
when that file exists; sorted, each once), `MODULE_NAME_RE` / `invalidModuleName` (the
plain module-name check), `refuseRootArg`, `readModuleSpec` (its error carries
`refused: true` for an invalid name or an escaping path), `readCompanions`
(returns `error` and no files when it refuses), `projectDefinesSpecCheckTask`
(the project `fledge.toml` defines a `spec-check` task; true when that file
cannot be read or parsed) and `runSpecCheck` (the Fledge `spec-check` task
when fledge is on PATH and the project defines it, else local `specsync
check`).

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
Protected infra (`.env*`, `.git`, `fledge.toml`, `bunfig.toml`,
`specs/**` / `*.spec.md`, `.specsync/` state outside the files of an active
`.specsync/changes/<id>/` folder, and any keystore file or directory inside
the project; a change folder's slug name is not a keystore) cannot be
overwritten or deleted via file tools (SAFE-2); no in-band override. Memory plugins take the acting user and ADMIN
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
commits only those paths (`--only`), refuses `.env*` / keystore (any
component, files in a keystore dir too) / `.git` paths and staging the
deletion of SAFE-2 protected infra, and reports
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
so the lines after it are commands), and refuses if either does; a command
with `$'` is also checked with `$'…'` read as bash's ANSI-C quoting (a
backslash escape in it counts as an expansion). Each `eval` argument and `trap` action, and the
`-c` string of a shell (`sh bash dash zsh ksh mksh ash yash posh`, by name or
path, anywhere in the command: behind `env`, `timeout`, `xargs`, `find -exec`
…; `-` ends its options like `--`, and `o` in a cluster such as `-co pipefail`
takes the next word), is checked the same way as a command. So is each script
the command runs in a shell, read from the root and every in-root `cd` target
before it: a file sourced with `.` / `source`, named by `BASH_ENV=` or a
shell's `--rcfile` / `--init-file`; a file a shell runs as its operand or reads
through `<` / `<>`; a here-doc (an unquoted body as the shell expands it) or
here-string a shell reads; and a file run by path (a command word holding `/`,
also behind the wrappers above) whose `#!` names a shell or that has no `#!`
and is text. An offending target names the script (`/etc (in ./x.sh)`). A
script that cannot be checked refuses: a path that would expand, a sourced or
shell-run file that does not exist, more than 1 MiB of script text or more than
32 scripts or directories to place them in, a script the command writes (an
output redirection target or an argument of a command that is not read-only,
whatever the order), shell input that would expand, and a shell reading
commands from anything else (a pipe, its inherited standard input, a process
substitution). A file run by path that does not exist yet (a program the
command builds) or is not a shell script (a binary, a `#!` for another
interpreter) is not read. Alias definitions refuse. A `cd` / `pushd` left open by an unterminated quote or a
trailing `\` refuses, as does a command nested too deeply to check. It looks past prefix words (`{ } ! if
then else elif do while until time builtin command`, `function NAME`) and
`NAME=value` / `NAME+=value` assignments, drops redirections (with their
targets and any `fd` prefix such as `2>&1`, never splitting on a redirection
`&`) and skips `cd` options (`-P -L -e -@ -n --`). It refuses `cd -`, a target
the shell would expand (`$`, backtick, glob, brace), a command word that would
expand, an `eval` or shell `-c` string that would expand, escaping `cd` inside a command
substitution (`$(…)` / backticks), and `DIRSTACK` writes. CDPATH is not refused
lexically: the child shell runs `CDPATH=; readonly CDPATH` and does not inherit
`CDPATH` or `OLDPWD`, so a `CDPATH` set (even dynamically) in the command cannot
redirect a relative `cd`. SAFE-1 non-interactive deny applies unless allowlisted.
The clamp is lexical, so some routes stay out of its reach and are residual
risk rather than refusals: a directory change made by another interpreter
(`python3 -c`, `node -e`, `perl -e`, a `#!` script for one) or by a tool that
runs its own shell strings (`make`, `npm run`, `watch`, `flock -c`, `su -c`,
`ssh`); a script written by a command that does not name it (`tar x`,
`unzip`, `git checkout`, `cp -r`, a generator) or changed after the check; and
a script found through a `PATH` or `hash -p` the command changes. Scripts that
`cd` through a variable (`cd "$(dirname "$0")"`, `cd "$SCRIPT_DIR"`) refuse
like the same `cd` typed directly.


File write/edit are `mutating: true` even when `dangerous: false` (ROLES-CHAT-5).
When `CORVIDINHO_ACTING_IS_ADMIN` is set (Discord/WATCH/schedule acting session),
the acting role (IDENTITY-8..12, REQ-plugins-065) is resolved at every call by
`resolveActingRole` (`src/plugins/roles.ts`): `owner` (the ADMIN re-check:
bridge bit + configured owner, not muted or deny-listed) runs every mutating
plugin, still behind SAFE-1 for dangerous tools (ROLES-CHAT-4 / IDENTITY-9);
`team` — only when the spawning surface stamped `CORVIDINHO_ACTING_ROLE=team`
(Discord chat, slash, buttons) and the owner's people list, re-read now,
declares the acting Discord id team — runs only `TEAM_REVIEW_TOOLS`
(`github-issue-comment`, `github-pr-review`) plus, in a `/work` run
(`CORVIDINHO_ACTING_WORK_TASK=1`), `TEAM_WORK_TOOLS` (`files-write`,
`files-edit`); `community` (everyone else: undeclared, declared community,
WATCH, schedules, workers, muted / deny-listed, any read failure) runs none
(IDENTITY-10/11). Refusals are "not allowed for your role" (ROLES-CHAT-3/6).
A team `github-pr-review` posts as `COMMENT` only: `--event APPROVE` /
`REQUEST_CHANGES` get the role refusal (exit 2) unless the role, re-resolved
at the call, is owner or there is no role session. In a team `/work` run
`files-write` / `files-edit` refuse a secret-looking path (`isSecretPath`,
exit 2) like the read tools, so an edit is never a read oracle (ROLES-CHAT-8).
`roleAllowsPlugin(role, cmd, workTask)` is the one rule for `runPlugin` and
the catalog (REQ-agent-065); with no stamp the ADMIN bit alone caps at owner
(`actingRoleCap`), and a stamp never raises the role.

Community role sessions may call GitHub read tools against any *public*
repository after deny-list checks (ROLES-CHAT-8). Private or unknown
visibility is refused. Team reads pass on a GITHUB-6-allowlisted or confirmed
public repo; GitHub writes (`checkRepoGateForActingRole(repo, { write: true
})`: issue create/comment, PR create/review) pass for team only on an
allowlisted repo and are refused for community (IDENTITY-10). Owner / non-role
sessions keep the GITHUB-6 allowlist gate.

ROLES-CHAT-8.a (REQ-plugins-066, `plugins/github/public-docs.ts`): the
community site / roadmap sources are the public repo docs and the public
issues and milestones of allowed public repos, read with
`github-docs-read` (README by default, a root `STATUS*` / `CHANGELOG*` file or
anything under `docs/`, a directory listed; any other path refused with exit
2 for every role before GitHub is called, `publicDocPath`; non-owner role
sessions also refuse a secret-looking doc path and never list one,
`isSecretPath`; text SAFE-6 scrubbed, capped at 64 KiB, labelled untrusted)
and `github-milestone-list`
(`issues.listMilestones`, `--state`, `--limit` ≤100) — both read-only,
minTier 0, behind the acting role's repo gate. `web-fetch` stays dangerous,
so no site URL is a community source.

`files-read` refuses secret-looking paths (`.env*`, `.ssh`, keystores, key
files) for non-ADMIN role sessions via `isSecretPath`. `search-grep`,
`files-list` and `git-diff` refuse an explicit secret path the same way (also
through a symlink), and `search-grep`, `git-diff`, `files-glob` and
`files-list` leave secret paths out of their results, whatever `--include`,
glob or `--staged` is passed (REQ-plugins-267). ADMIN and the local CLI keep
the access `files-read` gives.

`files-read` image mode (DISCORD-9 / REQ-plugins-427): after the path clamp,
the ROLES-CHAT-8 secret gate and the existing-file check, a file whose leading
bytes are PNG, JPEG, GIF or WebP (`sniffImageMediaType` in
`plugins/files/image.ts`; the name does not count) is returned as an image:
`data` `{path, bytes, mediaType, image: true}`, message `image <path> (<mime>,
N bytes) opened for viewing`, no UTF-8 `content`. The bytes ride base64 only on
`PluginHandlerResult.image` (`PluginImage` `{path, mediaType, base64}` in
`src/plugins/types.ts`), which no tool text, event, ndjson frame or CLI output
serializes; the agent tool loop turns it into an image part (REQ-agent-428).
An image over `MAX_IMAGE_SIZE_BYTES` (20 MB, the Discord attachment cap) is
refused. Every other file reads exactly as before.

SAFE-5 audit chain (REQ-plugins-095): once `audit_log` holds a keyed row it
stays keyed. `appendAudit` without `CORVIDINHO_AUDIT_HMAC_KEY` refuses to
append after a keyed row (a dangerous run is then refused, fail closed), and
`verifyAudit` with the key reports an unkeyed row after a keyed row as the
break. An unkeyed prefix followed by keyed rows still verifies as mixed.
Rewriting every keyed row as unkeyed (from the first keyed row on) or dropping
the newest rows is not detectable from the DB alone; it needs an anchor kept
outside the DB.

SpecSync tools stay inside the project (SPECSYNC-1 / SPECSYNC-5 / SPECSYNC-6,
PLUGIN-1, REQ-plugins-008).
`specsync-read` / `specsync-brief` take only a plain module name
(`[A-Za-z0-9_-]+`, the registry form; optional `name=` prefix): an absolute
path, `.` / `..`, a path separator, NUL or any other character is refused
(exit 1, nothing read, the name JSON-escaped in the error). Every file they
read (module spec, legacy flat spec, companions) must realpath inside the real
`specs/` dir, which must itself realpath inside the project root; a symlinked
specs dir, module dir, spec or companion that leaves it is refused (a refused
companion fails the whole brief) and its content is never returned; the
Planning spec briefing reads through the same helpers and skips it too.
`specsync-coverage`, `specsync-score`, `specsync-change-list` and
`specsync-ship-status` refuse a forwarded `--root` / `--root=…` (exit 1) before
spawning `specsync`. `specsync-list` and `specsync-check` take no path input.

`specsync-list` (and the Planning briefing's module list) lists, sorted and
each name once, in a SpecSync project (`.specsync/` is a dir, the layout
`specsync init` / `specsync scaffold` leave) each
`specs/<name>/<name>.spec.md` that `specsync-read` would read: a plain module
name whose spec is a file resolving inside the real `specs/` dir (a legacy
flat `specs/<name>.md`, a dir without its spec, or a spec or module dir that
links outside `specs/` is not listed). No `.specsync/` dir, no `specs/` dir, or
a `specs/` dir resolving outside the project adds no name from `specs/`. When
`.specsync/registry.toml` exists its `[specs]` names are listed too: SpecSync
does not keep that file in step with `specs/` (`specsync init` writes none,
and `specsync scaffold` does not add to the one `specsync init-registry`
writes), so a registry never hides a module under `specs/` (SPECSYNC-1/5).

`specsync-check` runs `fledge run spec-check` only when fledge is on PATH and
the project's own `fledge.toml` defines a `spec-check` task; with no
`fledge.toml` or no such task it runs the local `specsync check` (the
project's `.specsync` config decides its rules) instead of failing on an
unknown Fledge task. A `fledge.toml` that cannot be parsed keeps the Fledge
path (fail closed). `specsync-score` (SPECSYNC-3) is read-only (tier 0, not
dangerous, no API key) and returns the local `specsync score` report with the
forwarded args (module filters, `--explain`, `--format json`).
`specsync-coverage`, `specsync-change-list` and `specsync-ship-status` refuse a
forwarded `--root` / `--root=…` (exit 1) before spawning `specsync`.
`specsync-list` and `specsync-check` take no path input.
Language runners (PLUGIN-4, REQ-plugins-313..314): at builtin load each of
`node`, `python3` (else `python`) and `cargo` is resolved with `Bun.which` over
the absolute entries of PATH only, skipping a hit that is the running Bun
binary (the `node` shim `bun run` adds); a found toolchain registers `node-exec` /
`python-exec` / `cargo-exec` bound to that absolute binary, a missing one
registers nothing (never offered, never a tool that cannot start). Each runner
is `dangerous: true`, `minTier: 2`, and spawns `[bin, ...argv]` (no shell) with
cwd = the plugin cwd, the verify lane's scrubbed env (`buildVerifyEnv`) minus
`CDPATH` / `OLDPWD` plus `CORVIDINHO_PROJECT_ROOT`, stdin closed, a 10 minute
timeout (exit 124), 64 KiB per-stream caps, and its process group killed on
timeout or the calling run's abort (exit 130); output is secret-scrubbed. Empty
argv is a usage error (exit 1, nothing spawned); a binary that cannot start
returns exit 127. `plugins list` prints which runners loaded (with the binary)
and one line per missing toolchain, and still exits 0. `shell-exec` is
unchanged and always registered. The pinned cwd is where the runner starts,
not a sandbox: the code it runs can `process.chdir` / `os.chdir`, and
`cargo --manifest-path` can name another crate; no SAFE-3 `cd` clamp applies
(the runners add no shell). They are gated like `shell-exec` instead:
dangerous, SAFE-1 allowlist, code tier, ADMIN only.

Fledge core builtins (PLUGIN-1, REQ-plugins-461) are always registered and run
the fledge binary found, when the command runs, on the absolute PATH entries
only (none → ok=false, exit 127 `<name>: fledge not on PATH`), as
`[fledge, "--non-interactive", ...]` argv arrays (no shell) with cwd = the
plugin cwd: `fledge-lanes-list` → `lanes list --json` (no args), typed
`{count, lanes: [{name, description, steps, failFast, trustTier}]}`;
`fledge-lanes-validate` → `lanes validate --json` plus `--strict` when that is
the only arg (any other arg, a path included, is a usage error), typed
`{valid, strict, laneCount, errors, warnings}` and ok=false when fledge
reports an error (or a warning under `--strict`); both `dangerous: false`,
minTier 0, 30 s timeout. `fledge-lanes-run` → `lanes run <lane>` (exactly one
lane name) and `fledge-run` → `run <task>`, plus `-- <args…>` verbatim when
args follow the task; both `dangerous: true`, minTier 2 (they run the
project's own commands, like `shell-exec`), 10 minute timeout, ok only on
exit 0, a failing lane / task returns fledge's exit code and output. A lane or
task name must match `FLEDGE_NAME_RE` (`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$`,
no leading `-`), so model argv never becomes a fledge option (`--init`,
`--list`, `--lang`, `--dry-run`, `--from`); a refused name spawns nothing
(usage error, exit 1). The child env is the verify lane's scrub
(`buildVerifyEnv`) minus `CDPATH` / `OLDPWD` plus `FLEDGE_NON_INTERACTIVE=1`
and `CORVIDINHO_PROJECT_ROOT`; stdin closed, 64 KiB per-stream caps, process
group killed on timeout (exit 124) or the calling run's abort (exit 130);
output and parsed fields are secret-scrubbed, parsed fields control-char
cleaned and capped. fledge prints the offending line of a lane source it
cannot parse, so before either read starts fledge, `fledge.toml`, the
`.fledge/lanes` dir and each `.fledge/lanes/*.toml` that exists must resolve
(symlinks followed) inside the real project root, to a regular file (the dir
to a directory), at a path that is not a secret path as named or as resolved
(`isSecretPath`); otherwise `laneSourcesRefusal` names the project-relative
path and the read is refused (exit 2, fledge not started; ROLES-CHAT-8, as
`files-read`). The runs are not clamped (code tier, ADMIN only, allowlisted
like `shell-exec`). Builtins load before the project's Fledge plugins, so a
Fledge plugin command named `run`, `lanes-list`, `lanes-validate` or
`lanes-run` is skipped by that load with `name already registered by builtin`
(REQ-plugins-112), as fledge's own `run` shadows such a plugin command on its
command line.

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

### Scenario: SAFE-3 clamp checks the scripts a command runs

- **Given** builtins loaded, `shell-exec` allowlisted, and `bad.sh` in the root holding `cd /etc`
- **When** the agent runs `./bad.sh`, `sh bad.sh`, `. ./bad.sh`, `sh < bad.sh`, a here-doc `cd /etc` fed to `sh`, `cat bad.sh | sh`, `trap 'cd /etc' EXIT`, `alias c=cd`, or writes a script and runs it in the same command
- **Then** the run fails with exit 2 and a SAFE-3 refuse message naming the script; no spawn; an in-root `./ok.sh`, `sh okcd.sh` (`cd sub`) or `bash scripts/build.sh` still runs

### Scenario: SAFE-3 CDPATH cannot redirect a relative cd

- **Given** `shell-exec` allowlisted
- **When** the command sets `CDPATH` (literally or dynamically) to an outside dir and then runs `cd sub`
- **Then** the child shell's `readonly CDPATH` and dropped `CDPATH`/`OLDPWD` env keep `cd sub` under the root; no outside path is reached

### Scenario: language runner registered when its toolchain is on PATH

- **Given** `node` is on PATH and `CORVIDINHO_ALLOWLIST` names `node-exec`
- **When** a non-interactive run calls `node-exec` with `["-e","console.log(process.cwd())"]`
- **Then** node runs with that argv (no shell) in the project root and prints it; without the allowlist entry the run is denied (exit 2, SAFE-1)

### Scenario: missing toolchain degrades cleanly

- **Given** `cargo` is not on PATH
- **When** builtins load and an operator runs `corvidinho plugins list`
- **Then** `cargo-exec` is not registered or offered, the list prints `cargo-exec not loaded: cargo not found on PATH`, and exits 0 with every other builtin listed

### Scenario: Fledge itself as typed commands

- **Given** builtins are loaded, fledge is on PATH and the project's `fledge.toml` defines a `verify` lane
- **When** a tool-tier run calls `fledge-lanes-list`, and a non-interactive run with `CORVIDINHO_ALLOWLIST` naming `fledge-lanes-run` calls it with `["verify"]`
- **Then** the list comes back typed (lane names, step counts, descriptions) without an allowlist entry, and `fledge --non-interactive lanes run verify` runs in the project root; without the allowlist entry the lane run is denied (exit 2, SAFE-1) and fledge never starts

### Scenario: SpecSync tools refuse to read outside the project

- **Given** builtins are loaded and a file `outside.md` sits outside the project
- **When** the agent runs `specsync-read ../../<outside>/outside` or `specsync-brief ../../<outside>`, or `specsync-read <module>` whose spec, module dir or companion is a symlink to a file outside the project
- **Then** the run fails with exit 1 and a one-line refusal; no content from outside the project is returned

### Scenario: SpecSync project without registry.toml

- **Given** a project where `specsync init` + `specsync scaffold billing` left `.specsync/` and `specs/billing/billing.spec.md` with `context.md` / `tasks.md`, and no `.specsync/registry.toml`
- **When** the agent runs `specsync-list` (or `corvidinho specsync list`), or starts a task on the billing module
- **Then** `billing` is listed (`1 spec(s) registered`), `specsync-read billing` / `specsync-brief billing` return it, and the Planning briefing carries `# Spec: billing` with its companions

### Scenario: SpecSync registry.toml older than specs/

- **Given** a project where `specsync init` + `specsync scaffold billing` + `specsync init-registry` + `specsync scaffold auth` left a `.specsync/registry.toml` naming only `billing`
- **When** the agent runs `specsync-list`, or starts a task on the auth module
- **Then** both `auth` and `billing` are listed, and the Planning briefing carries `# Spec: auth` with its companions

### Scenario: specsync-check without a Fledge spec-check task

- **Given** a project with `.specsync/` and `specs/` whose `fledge.toml` has no `spec-check` task (or no `fledge.toml`), and fledge on PATH
- **When** the agent runs `specsync-check`
- **Then** the local `specsync check` runs and its result is returned; there is no `Unknown task 'spec-check'` failure

### Scenario: specsync-score answers "are we drifting?"

- **Given** builtins are loaded and `specsync` is on PATH
- **When** the agent runs `specsync-score` (or `corvidinho specsync score cli --explain`)
- **Then** the local `specsync score` report (per-spec 0-100 and grade) is returned; `--root` is refused before spawning

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

### Scenario: files-read opens an attached screenshot as an image (DISCORD-9)

- **Given** a PNG at `<cwd>/.corvidinho/attachments/m-0.png`
- **When** `files-read` runs on that path
- **Then** it returns `data.image` true with `mediaType` `image/png` and no `content`, and the file's bytes only on `result.image` (base64) for the tool loop

### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

### Scenario: non-ADMIN search-grep never returns secret lines (ROLES-CHAT-8)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=0` and a project with `.env` holding a key
- **When** the agent runs `search-grep OPENAI_API_KEY .env`, or `search-grep <pattern>` over the project with any `--include`
- **Then** the explicit path is refused with exit 2 like `files-read`, and the recursive search returns no line from `.env*`, `.ssh`, key or keystore files

### Scenario: non-ADMIN git-diff never shows a tracked secret file (ROLES-CHAT-8)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=0` and a repo with a tracked, modified `certs/server.pem` and `src/a.ts`
- **When** the agent runs `git-diff`, `git-diff --staged` or `git-diff certs/server.pem`
- **Then** the diff shows `src/a.ts` only, and the explicit secret path is refused with exit 2 like `files-read`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |
| Team role, mutating tool outside its review tools (and work tools in /work) (IDENTITY-10) | Deny (exit 2, not allowed for your role) |
| Team GitHub write on a repo not on the GITHUB-6 allowlist (IDENTITY-10) | Refuse (exit 3, GITHUB-6) |
| `github-docs-read` path outside README / docs/ / STATUS / CHANGELOG (ROLES-CHAT-8.a) | Refuse (exit 2) before GitHub is called |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape (incl. dangling link target or loop) | Refuse (exit 1) |
| specsync-read/brief name not a plain module name, or a spec/companion/specs dir whose real path leaves the project specs dir | Refuse (exit 1); nothing read |
| specsync-coverage/score/change-list/ship-status given `--root` | Refuse (exit 1); specsync not spawned |
| specsync-list / Planning briefing with no `.specsync/registry.toml`, or one naming only some modules | List `specs/<name>/<name>.spec.md` modules that stay inside `specs/` (only when `.specsync/` is a dir) plus any registry names; none → `0 spec(s) registered`, no briefing |
| specsync-check, fledge on PATH but the project defines no `spec-check` task | Run local `specsync check` (no `Unknown task` failure) |
| specsync-check, project `fledge.toml` unparsable | Keep `fledge run spec-check` (fail closed; Fledge reports the error) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root (incl. `cd -`, options, prefix words, redirections, quoting incl. bash `$'…'`, `\`-newline, comments, here-docs, expanded command words, command substitutions, `eval` and shell `-c` strings, DIRSTACK) | Refuse (exit 2, SAFE-3); no spawn |
| shell-exec cd/pushd left open by an unterminated quote or trailing `\`, or a command nested too deeply to check | Refuse (exit 2, SAFE-3); no spawn |
| shell-exec runs a script (sourced, `BASH_ENV` / `--rcfile`, shell operand or input, here-doc / here-string, run by path) whose cd/pushd escapes, or a `trap` action that does, or defines an alias | Refuse (exit 2, SAFE-3) naming the script; no spawn |
| shell-exec runs a script the clamp cannot check: path would expand, sourced / shell-run file missing, over 1 MiB of script text or 32 scripts, written by the same command, shell input that would expand, or a shell reading a pipe / inherited stdin / process substitution | Refuse (exit 2, SAFE-3); no spawn |
| shell-exec sets CDPATH (literal or dynamic) then runs a relative cd | Child shell `readonly CDPATH` + dropped env keep the cd in-root (SAFE-3) |
| Dangerous run with no audit key while the audit chain is keyed | Refuse (exit 2, SAFE-5 audit log unavailable); handler not run |
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
| fledge-lanes-run / fledge-run non-interactive + not allowlisted | Deny (exit 2, SAFE-1); fledge not started |
| fledge-lanes-run / fledge-run lane or task name not a plain name (leading `-`, space, `/`, empty), extra lanes-run args, or any fledge-lanes-list arg / non-`--strict` fledge-lanes-validate arg | Usage error (exit 1); fledge not started |
| fledge core builtin with no fledge on an absolute PATH entry | ok=false, exit 127 `<name>: fledge not on PATH`; never throws |
| fledge-lanes-validate on lanes with errors (or warnings under `--strict`) | ok=false with fledge's exit code (1), the errors and warnings |
| fledge-lanes-list / fledge-lanes-validate with a lane source (`fledge.toml`, `.fledge/lanes`, `.fledge/lanes/*.toml`) resolving outside the project, to a secret path, or to the wrong entry type | Refuse (exit 2) naming the project-relative path; fledge not started; contents and link target not returned |
| Fledge plugin command named `run` / `lanes-list` / `lanes-validate` / `lanes-run` | Skipped by the Fledge plugin load (`name already registered by builtin`); the builtin keeps the name |
| node / python3+python / cargo not on PATH at builtin load | Runner not registered or offered; `plugins list` names it `not loaded` and exits 0 (PLUGIN-4) |
| node-exec / python-exec / cargo-exec non-interactive + not allowlisted | Deny (exit 2, SAFE-1); nothing spawned |
| runner called with no argv | Usage error (exit 1); nothing spawned |
| runner binary gone after load (cannot start) | ok=false, exit 127 with the reason; never throws |
| runner times out / calling run aborts | exit 124 / 130; runner process tree killed |
| files-read of a PNG/JPEG/GIF/WebP over 20 MB | refused `refused: image '<path>' is N bytes, over the 20MB image limit` (exit 1), no bytes read into the result (REQ-plugins-427) |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |
| node / python3 / python / cargo (optional system binaries) | language runners via `Bun.spawn` argv arrays, only when on PATH |
| src/agent/verify.ts | `buildVerifyEnv` scrub for the language runners' and Fledge core builtins' child env |
| fledge (optional system binary) | Fledge core builtins (`lanes list` / `lanes validate` / `lanes run`, `run`) and the Fledge plugin bridge, via `Bun.spawn` argv arrays |
| node:dns / net / tls | web-fetch resolve once, dial pinned IP, SNI + cert check |
| src/store/scrub.ts | `scrubSecrets` on web-fetch output and errors; secret-bearing URLs refused |
| src/discord/image-attachments.ts | `MAX_IMAGE_SIZE_BYTES` / `ImageMediaType` for files-read image mode (DISCORD-9) |
| git (system binary) | git plugins via `Bun.spawn` argv arrays |
| /proc (Linux) | process-tree walk for bounded child stops (proc-group) |

## Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26). Historical
and current rows for plugins host evolution.

| 2026-09-26 | discord-user-lookup read-only guild member resolve (REQ-plugins-312 / IDENTITY-5) |
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
| 2026-09-26 | audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and: Audit append and SAFE-6 re-scrub take the SQLite write lock up front (BEGIN IMMEDIATE) so busy_timeout applies and concurrent writers wait instead of failing with database is locked (SAFE-5, SAFE-6) |
| 2026-09-26 | safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded: SAFE-3 shell-exec cd clamp fails closed — quote-aware tokenizer joins `\`-newlines, drops redirections (never splitting a redirection `&`), refuses expanded command words, `eval` with expansion, escaping cd inside command substitutions and DIRSTACK writes; CDPATH protection moves to the child shell's `CDPATH=; readonly CDPATH` (dropped CDPATH/OLDPWD env) so a dynamic CDPATH cannot redirect a relative cd; closes PR #187 review findings |
| 2026-09-26 | allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped |
| 2026-09-27 | concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process: Concurrent audit appends from several processes lose no SAFE-5 rows: regression test for REQ-plugins-287 multi-process acceptance (review follow-up for PR 211) |
| 2026-09-26 | safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so: SAFE-5 audit verify rejects unkeyed rows after a keyed row and appendAudit refuses unkeyed appends to a keyed chain so keyed rows cannot be relinked as unkeyed SHA-256 |
| 2026-09-26 | safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded: SAFE-3 shell-exec cd clamp fails closed — quote-aware tokenizer joins `\`-newlines, drops redirections (never splitting a redirection `&`), refuses expanded command words, `eval` with expansion, escaping cd inside command substitutions and DIRSTACK writes; CDPATH protection moves to the child shell's `CDPATH=; readonly CDPATH` (dropped CDPATH/OLDPWD env) so a dynamic CDPATH cannot redirect a relative cd; closes PR #187 review findings |
| 2026-09-26 | allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped |
| 2026-09-27 | safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a: SAFE-5 audit REQ-plugins-095 states the keyed-downgrade guarantee accurately: verify catches an unkeyed row after a keyed row, but downgrading every keyed row or dropping the newest rows needs an out-of-DB anchor; go-live doc says a keyless process refuses dangerous runs on a keyed chain |
| 2026-09-27 | specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real: Specsync-read and specsync-brief refuse module names that are not a plain module name and never read a file whose real path is outside the project specs dir; coverage, change-list and ship-status refuse --root |
| 2026-09-27 | search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles: Search-grep, files-glob and files-list refuse and hide secret paths for non-ADMIN role sessions like files-read (ROLES-CHAT-8) |
| 2026-09-27 | discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping: Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.28 |
| 2026-09-27 | safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here: SAFE-3 shell-exec cd clamp reads quoting the way the shell does: escaped backslash before a newline, comments and here-doc bodies no longer hide a cd, the end of a command substitution is found with the same tokenizer, and a cd/pushd command left open by a quote or trailing backslash is refused |
| 2026-09-27 | local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89) |
| 2026-09-27 | plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on: PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root) |
| 2026-09-27 | files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision: Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9) |
| 2026-09-27 | specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync: SpecSync module listing falls back to the specs dir when .specsync/registry.toml is absent, so specsync-list, specsync-read and the Planning spec briefing (with companions) work in a standard SpecSync project (SPECSYNC-1, SPECSYNC-5); a registry.toml that exists adds its names to the specs-dir modules instead of hiding modules scaffolded after it |
| 2026-09-27 | safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and: SAFE-2: file tools refuse any keystore file or directory inside the project and SpecSync's .specsync/ config, registry and archive (active change folders stay writable) |
| 2026-09-27 | plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and: PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root |
| 2026-09-27 | safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or: SAFE-3 shell-exec cd clamp checks the scripts a command runs in a shell (sourced, handed to a shell as a file, here-doc or here-string, or run by path) and trap actions, refuses alias definitions and shells reading commands from an unknown input, and reads sh -c - and option clusters like -co pipefail |
| 2026-09-29 | three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key: Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65) |
