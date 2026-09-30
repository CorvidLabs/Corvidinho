# Testing — plugins

See `tests/plugins.*.test.ts` and `tests/github.*.test.ts`. Prefer fixtures over live `gh`.
- memory-* plugin list + forget ACL fixtures (REQ-plugins-010).
- github-pr-create dry run (`tests/github.write.plugin.test.ts`,
  REQ-plugins-051): a body that only mentions "Made with" and "Corvidinho"
  gets the `---` + `ATTRIBUTION_MARKDOWN` footer; a body that already holds
  `ATTRIBUTION_MARKDOWN` or `ATTRIBUTION_PLAIN` is left as it is.
- Octokit token (`tests/github.fixture.test.ts`, REQ-plugins-003): a
  whitespace-only `GITHUB_TOKEN` does not shadow a real `GH_TOKEN`; blank
  tokens only give no token and `createOctokit` refuses with the missing-token
  error before any request.
- files-* / search-grep happy path + SAFE-2 deny + path escape (REQ-plugins-081..084).
  SAFE-2 covers every path under `specs/` (`specs/agent/requirements.md`,
  `specs/agent/context.md`, a new `specs/notes.md`), not only `*.spec.md`, for
  files-write / files-edit / files-delete and the git-commit staging of a
  deletion (REQ-plugins-083 / REQ-plugins-182).
  SAFE-2.a covers every path under `.fledge/` (`.fledge/lanes/verify.toml`,
  `.fledge/config.toml`, a new lane file, `.fledge` itself) in every spelling
  (`./`, `src/../`, other case, absolute) and through a symlink to a lane
  file, a symlink to `.fledge/lanes` and a dangling symlink, for files-write /
  files-edit / files-delete and the git-commit staging of a deletion, while
  files-read / files-list of `.fledge/` still work (REQ-plugins-083;
  `tests/files.plugins.test.ts`, `tests/git.plugins.test.ts`; both fail on
  main's `isProtectedPath`).
- web-fetch SAFE-7 guard: every blocked range, DNS answers, redirect/rebinding, caps, content types via injected resolver/transport; loopback-only socket + TLS SNI fixtures (REQ-plugins-111).
- git-* plugins against temp repos (`git init` in mkdtemp, isolated git config)
  and a local bare remote at `<tmp>/acme/widget.git` gated via
  `CORVIDINHO_GITHUB_ALLOW_REPOS` / a temp allowlist file (REQ-plugins-182);
  `deny_repos` and `deny_orgs` win over an allow list that names the repo
  (REQ-plugins-004).
- ROLES-CHAT-8 community repo gate through the real Octokit visibility lookup
  (no injected lookup; `fetch` stubbed, no network): private refused with no
  pulls call, 404 / no token refused as unconfirmed, public admitted
  (`tests/github.public.community.test.ts`, REQ-plugins-493).
- `delegate` autonomous plugin against sh / `.ts` fake bins in mkdtemp dirs:
  refusals spawn nothing, argv / env of the worker, failure, spawn failure, timeout, abort,
  drain, `.env` isolation, worker env without bridge / GitHub tokens or the
  audit key (`tests/autonomous.delegate.test.ts`, REQ-plugins-117); `delegate`
  mutating ⇒ non-ADMIN role session catalog omits it and `runPlugin` refuses it
  (`tests/autonomous.enabled.test.ts`, ROLES-CHAT-2/3).
- `council` autonomous plugin against a `.ts` fake bin in a mkdtemp dir:
  declaration, SAFE-9 catalog, refusals spawn nothing (incl. a depth 1
  delegated worker), voice argv / env (read
  tier, empty allowlist, `CORVIDINHO_ACTING_IS_ADMIN=0`, stripped tokens),
  tier clamp, long decision kept past the chat-body cap, failed chair, council time cap, one-at-a-time limiter, non-ADMIN
  `runPlugin` refusal (`tests/autonomous.council.test.ts`, REQ-plugins-118).
- SAFE-5 audit line without a key (`tests/audit.log.test.ts`,
  REQ-plugins-095): three unkeyed rows read `chain OK (unkeyed — …)`; with
  row 2 tampered behind the dropped trigger, `verifyAudit` without a key
  gives `keyedRows: 0, brokenAtSeq: 2` and the line reads
  `Audit: 3 entries · chain BROKEN at #2`, the same as with a key; an
  unkeyed prefix before a keyed row reads `cannot verify keyed rows …`
  intact and `chain BROKEN at #1` once row 1 is tampered; a keyed chain
  read without the key still reads `cannot verify keyed rows …`. Against
  the base without the fix: fails (`cannot verify keyed rows …`).

## discord-post-message (REQ-plugins-009)

`tests/discord.post.plugin.test.ts` — dangerous listing, SAFE-1 deny, empty
channel allowlist refused, and the channel gate uses the bridge's set: a
channel only in `DISCORD_CHANNEL_IDS` posts (dry run), a channel in no list
and a deny-listed channel are refused with exit 3.

## discord-user-lookup (REQ-plugins-312)

`tests/discord.user-lookup.test.ts` — see also discord testing companion.

## Shell foot-guns, env -C and symlinked cd (REQ-plugins-087, REQ-plugins-494..495)

`tests/shell.footguns.test.ts` — temp project, temp outside dir and a temp
`HOME` holding `~/.config/corvidinho/env` and `~/.netrc`; every refused
command starts with `touch spawned` (and every script writes it first), so a
refusal that spawned anything is caught. Each SAFE-21 family refuses end to
end with exit 2, `rule: "SAFE-21"`, its family and a `<why>; <instead>`
message (edit, download, delete, secret), also from in-root scripts run with
`sh`; outside victims survive; in-root deletes, reads and redirects to
`/dev/null` / fd dups still run; downloads used as data are not refused. The
child env has no LLM / Discord / GitHub keys, askpass or ssh agent, git reads
no global config and never prompts, gh's config dir is empty, and a
credential helper in `~/.gitconfig` and in the repo config never runs against
a local HTTP server answering 401; an aborted run kills `sleep 60` (exit
130); output is capped and a `ghp_…` token scrubbed.
`tests/shell.clamp-bypass.test.ts` — `env -C` / `--chdir` / `-iC` / `--ch`
/ `sudo -D` / `env -S`, `cd` / `pushd` through in-root symlinks that point
out, and `ln` targets that lead out refuse (unit and end to end, SAFE-3);
in-root `env -C sub` and a link to an in-root dir still run.
`tests/shell.clamp-scripts.test.ts` — the written-script case writes through
`tee`, since a `>` edit is refused first by SAFE-21.
`tests/runners.plugins.test.ts` — the runners' child env is credential-free
(SAFE-21.a, REQ-plugins-495).

## Language runners (REQ-plugins-313..314)

`tests/runners.plugins.test.ts` — stub `node` / `python3` / `cargo` /bin/sh
scripts in a mkdtemp PATH dir: registration and danger/tier markings, python3
before python, relative PATH entries ignored, a `node` symlink to Bun skipped
(also under `bun run corvidinho plugins list`), argv verbatim (no shell) and cwd
= project root, non-zero exit, usage error, scrubbed child env, SAFE-1 deny,
code-tier / dangerous / ADMIN-only catalog, abort and timeout kill the tree;
an empty PATH registers nothing and `plugins list` (CLI spawn) exits 0 naming
each missing runner; a deleted binary returns exit 127. Real `node`, `python3`
and `cargo` smoke tests are skipped where the toolchain is not installed.

## Fledge core builtins (REQ-plugins-461, PLUGIN-1)

`tests/fledge.core.test.ts` — a fake `fledge` /bin/sh script in a mkdtemp PATH
dir records argv, cwd and env: `loadBuiltins` registers `fledge-lanes-list` /
`fledge-lanes-validate` (not dangerous, minTier 0) and `fledge-lanes-run` /
`fledge-run` (dangerous, minTier 2); tool-tier / code-tier / dangerous /
non-ADMIN catalogs; a Fledge plugin command named `run` or `lanes-list` is
skipped and the builtin keeps the name; lanes list / validate argv and typed
data (control chars cleaned, fledge's path not passed on), `--strict`,
invalid lanes ok=false, args / a path refused before spawning; SAFE-1 deny for
the runs without an allowlist entry and fledge not started, allowlisted
`lanes run verify` in the project root with the scrubbed env; `fledge-run` and
`fledge-lanes-run` start fledge without the owner's GitHub or git credentials
(no `GH_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK` or inherited `GH_CONFIG_DIR`,
`GIT_CONFIG_GLOBAL=/dev/null`, an empty `credential.helper`, a key-less
`GIT_SSH_COMMAND`, gh's `hosts.yml` and the `~/.gitconfig` helper unseen;
SAFE-21.a, fails on the base's `plugins/fledge/core.ts`); `run <task> --
<args>` verbatim, no `--` without args; option-like or non-plain lane / task
names refused before spawning; exit code, secret scrub, timeout 124 and abort
130; fledge only on an absolute PATH entry, else exit 127; lane sources
(`fledge.toml`, `.fledge/lanes`, `.fledge/lanes/*.toml`) linked outside the
project, to `.env` or a `.env.toml`, or of the wrong entry type are refused by
both reads (exit 2, no contents or link target) before fledge starts, while
in-project links, non-`.toml` entries and a missing `fledge.toml` still reach
fledge and the runs are not clamped. Real-fledge tests (a temp `fledge.toml`,
an outside-linked `.fledge/lanes/y.toml` refused, and `corvidinho plugins run
fledge-lanes-list` in this repo) are skipped where fledge is not installed
(CI).
`tests/fledge.plugins.test.ts` "default catalog (no includeDangerous) never
discovers or offers Fledge commands" now expects the two read-only core
builtins and no Fledge plugin command (REQ-agent-112).

## files-read image mode (REQ-plugins-427, DISCORD-9)

`tests/files.plugins.test.ts` ("files-read image mode") — real 1x1 PNG in a
mkdtemp cwd: image metadata with no `content`, `result.image` base64
round-trips, stringified result < 1 KB with no U+FFFD; JPEG / GIF / WebP heads
sniffed whatever the name, a text `.png` stays text; > 20 MB refused (sparse
file), exactly 20 MB read; text read unchanged; path clamp and ROLES-CHAT-8
secret gate still refuse first. No network.

## Three roles in the tool layer (REQ-plugins-065, IDENTITY-8..12)

`tests/roles.team.test.ts` — a temp allowlist file with `[owner]`, a team
person, a declared-community person, a person with no `role` and an
undeclared id: `role` parsing (TOML/JSON, any case; a list, unknown or empty
value skips the entry; `role = "owner"` on anyone but the owner's person is
community with an issue); `resolveActingRole` gives owner / team / community
from the live file, the surface stamp only lowers it (owner stamp + team
person ⇒ team; no stamp, `community` stamp, undeclared / community / no-role
person ⇒ community), a file edit, mute, deny-list or unreadable file applies at
the next call; `roleAllowsPlugin` for every registered plugin; `runPlugin` as
team: `github-issue-comment` / `github-pr-review` run (dry-run) on an
allowlisted repo, a non-allowlisted one gets GITHUB-6, every other mutating
tool the role refusal, `files-write` only with the `/work` flag (SAFE-2 still
refuses `.env`), a demotion refuses the next call, memory store/recall stay in
the actor's scope and forget/override are refused; team `github-pr-review`
runs as `COMMENT` and `APPROVE` / `REQUEST_CHANGES` get the role refusal (the
owner runs all three); a team `/work` `files-write` / `files-edit` refuses
secret-looking paths without revealing a match (the owner edits them);
`checkRepoGateForActingRole` by role (team reads allowlisted or public, writes
allowlisted only; community writes refused; deny wins). Fixture files,
dry-run GitHub, no network.

## Community site / roadmap readers (REQ-plugins-066, ROLES-CHAT-8.a)

`tests/github.public-docs.test.ts` — `publicDocPath` accepts README / STATUS /
CHANGELOG at the root and `docs/**`, refuses everything else (`..`,
backslashes, nested READMEs, source files, `.env`); `github-docs-read` and
`github-milestone-list` through a real Octokit with a mocked fetch in a
community role session: README, `STATUS.md` and a `docs/` file are read
(secrets scrubbed, untrusted note), a `docs/` directory lists its entries, a
doc over 64 KiB is truncated, a binary doc is refused, any other path is
refused with exit 2 before GitHub is called (CLI too), a private / unconfirmed
/ denied repo is refused before any read, a secret-looking doc path is
refused and left out of a `docs/` listing for a community session (the owner
reads and lists it); milestones map state, due date,
issue counts, a 500-char description, and `--state` / `--limit` reach the
API; bad flags are refused. The community catalog offers the readers and never
`web-fetch`. No network, no token.

Profiles, project memory and privacy (MEMORY-5..7, #101 / REQ-plugins-101):
`tests/memory.profiles.test.ts` — with a temp people list and data dir, a
declared person's `memory-store` lands in `person:<id>` and every linked
Discord id recalls it, rows stored under a Discord id before they were
declared are still read (a newer key in the profile wins, no duplicate), an
undeclared user keeps their Discord-id scope; `memory-profile` shows the
people list's role (a file edit changes it), projects, preferences, history
newest first and a private-note count without content. Another person
(community, undeclared, team) never sees someone's memory — default recall,
`--person` by id / Discord id / mention / unknown id, `memory-profile
--person` — and always gets the opaque `not authorized`; the owner with the
bridge bit reads it and its private notes with `--person` (not muted, not
without the bit); private notes are left out of default and query recalls,
returned only on `--category private` by that person or the owner in a
conversation, refused in a schedule run; `memory-store --person` is refused.
`--project` is keyed by origin `owner/repo` (credentials dropped) and shared
by a worktree, else the main checkout path, else the folder; the owner and
team read and write it, community / undeclared / a community-stamped team
member get the role refusal, the local CLI reads it; no private notes in a
project, `--project` with `--person` refused. The inject helpers and the
bridge give each speaker only their own profile, never private notes, and the
project block to owner / team only; a Discord id declared for two people
joins neither profile. Fails on the stacked base (13 of 16; three tests that
also hold there pass by design).

Memory on GitHub (MEMORY-8, #67 / REQ-plugins-067, which narrows REQ-plugins-101's
WATCH `--project` refusal to writes):
`tests/memory.recall-github.test.ts` › "MEMORY-8 memory in GitHub (WATCH)
runs" — with GitHub-shaped env a declared commenter (by numeric id, under
any login — IDENTITY-7.a) stores into `person:tofu`, recalls with a
plain-words `--query` and reads `memory-profile`, the same profile Discord
reads; the `[owner] github_id` recalls the owner's Discord-id memory and the
`[owner]` login alone recalls nothing; on GitHub private notes,
`memory-forget-me` and `--person` (any ref) are refused and another person's
rows never show; a login whose numeric id differs, or with no id, saves
nothing; an
undeclared commenter saves nothing (own or `--project`), has no personal
recall and reads only the thread repo's project memory with `--project`; a
Discord actor always wins over stale GitHub keys.
## Channel deny helper (REQ-plugins-005)

`tests/allowlist.default-deny.test.ts` ("isChannelDenied") — a deny-listed
channel id is reported whatever its case and surrounding space, allowlisted,
unlisted, empty and missing ids are not, and `checkChannel` reports the id as
denied. The thread paths that use it are in `tests/discord.thread-deny.test.ts`
(discord testing companion).

## Untrusted text in plugins (REQ-plugins-071, SAFE-11/12)

`tests/safe.injection.test.ts` — `lookupGuildMemberById` with a stubbed fetch
returns the nickname, global name and display name cleaned (no mention
markup, zero-width or bidi characters, role tags or labels) and a message
without `<@`; a community role session whose task claims the owner gets no
mutating tool and a role refusal for `files-write`. `tests/web.fetch.test.ts`
(unchanged) still passes with `fenceUntrusted` on the shared fence.
`delegate` over a fake worker bin whose result frame carries `injection`
returns the validated `data.injection` (an unknown reason dropped, a bad
source gives none); `runCouncil` keeps a voice's notice on its outcome.

## Scheduled runs use allowlisted repos only (REQ-plugins-496, REQ-plugins-065 / -493 / -111 modified, DISCORD-SCHEDULE-3.a)

`tests/github.schedule-repo-gate.test.ts` (stubbed `fetch` for GitHub,
resolver / transport seams for `web-fetch`; no token, no network):

- Marker: `SCHEDULE_SESSION_PREFIX` is `schedule_`; `isScheduleRunEnv` is
  true for `schedule_*` only (not `sess_*`, `work_*`, `wsess_*`, empty or
  unset); the scheduler's `runChat` session id is the prefix plus the
  schedule id; `buildDelegateSpawn` from a schedule lead (owner or community
  stamp, and a council voice's env) keeps the marker.
- Gate: in a schedule env a public repo off the allowlist is refused for the
  community and owner stamps and for a worker env, naming
  DISCORD-SCHEDULE-3.a, and the visibility lookup is never called; an
  allowlisted repo passes; deny wins; a community write is still refused
  (ROLES-CHAT-3) and a community read of an allowlisted private repo is still
  refused (ROLES-CHAT-8) while the owner stamp reads it; a `sess_*` community
  chat still reads the public repo.
- Plugins: `github-pr-list`, `github-issue-list`, `github-pr-diff`,
  `github-pr-files`, `github-docs-read` and `github-milestone-list` refuse the
  public off-list repo (exit 3) with no GitHub request; `github-pr-list` in a
  chat still sends its requests.
- `web-fetch`: in a schedule env, `raw.githubusercontent.com`, `github.com`
  (any case, trailing dot), `www.github.com`, `api.github.com/repos/…`,
  `codeload.github.com`, gist and other GitHub-host URLs of an off-list repo,
  or naming no repo, and a denied repo are refused (`blocked`) with no DNS or
  dial; allowlisted repos (a `.git` suffix too) and other hosts fetch; a
  redirect into `raw.githubusercontent.com`, and an allowlisted GitHub URL
  that redirects off the list, are refused on that hop after one dial; an
  unreadable allowlist refuses GitHub hops while other hosts fetch; with no
  session id or a `sess_*` one the same URLs and redirect fetch; the handler
  refuses in a schedule env (exit 2) and fetches in a chat.
- Fail on base: with the base sources (main dec7c31) of `roles.ts`,
  `githubPublic.ts`, `plugins/web/fetch.ts`, `plugins/web/commands.ts`,
  the worktree manager, the schedule handler and the scheduler swapped in, 11
  of the 17 tests fail (marker, gate refusals, plugin refusals, web-fetch
  refusals); the allowlisted / deny / role-rule / outside-a-schedule guards
  pass on both. All 17 pass on the branch. `tests/web.fetch.test.ts`,
  `tests/github.public.community.test.ts`, `tests/github.public-docs.test.ts`
  and `tests/roles.team.test.ts` pass unchanged.
## memory-forget-me on GitHub (REQ-plugins-1016, MEMORY-ACL-6.a)

- `tests/watch.forget-me.test.ts` › "in a WATCH run the model's
  memory-forget-me points at the comment path" — with the GitHub commenter
  env, the tool fails naming `says just "forget me"` and MEMORY-ACL-6.a, and no
  forget request is recorded.
## Private reads shown only privately (REQ-plugins-710, MEMORY-7.a)

`tests/memory.private-view.test.ts` — in a Discord-conversation env the
person's own private notes and profile and the owner's `--person` recall,
profile and private notes return their text only in `privateText`, with
`data` `{ sentPrivately: true, what }` and the placeholder `message`; the
person's own everyday recall still returns rows; a schedule refuses the
owner's `--person` view and profile and a person's own profile, a GitHub
thread refuses `memory-profile` (no content in any refusal); the local CLI
shows the profile inline. `tests/memory.profiles.test.ts` and
`tests/memory.recall-github.test.ts` read `privateText` where the model used
to get the rows.

## Must-ask gate (REQ-plugins-097, AUTONOMY-9/9.a, AUTONOMY-10/10.a, AUTONOMY-11)

`tests/must-ask.gate.test.ts` — through `runPlugin` with registered test
commands and a temp data dir: an approved card runs the call once after it
and the request ends `used` (kind `mustask`, class destructive, requester
`local`, the wait note names the one-time code); a channel post is the plain
`mustask-post` card with the exact text and names where it was asked from;
a deny runs nothing, the same call again is refused with no new card, a
changed call asks again; no answer lapses (`expired`, the refusal says the
bridge DMs the card) and does not block asking again; a delegate worker and
a run with no owner are refused with no card; an aborted wait is exit 130;
a run stopped just as the owner approves runs nothing; the wait line and a
refusal are secret-scrubbed and the wait line is what the live status shows;
a throwing classifier asks as prod; a refusal is a SAFE-5 `denied` row;
`discord-post-message` text claiming no OK is needed still raises the card
with the defanged text; the policy table; and the real card engine
(`mustAskApprovalKinds`) answering both kinds — prod needs Approve plus the
code, a post one press, Deny runs nothing.
`tests/must-ask.classify.test.ts` — the shell, runner, Fledge and git-push
classifiers over temp projects and repos (table commands, wrappers, npx,
package scripts, make / just recipes with variables, inline code, scripts,
unreadable forms, everyday commands that don't ask, SAFE-21 / clamp refusals
left to the handler, the tagged self-update and every near-miss form, the
recorded and unrecorded default branch; options and their values before a
git or gh subcommand, git aliases on the command line and in the repo's
config, `bun <script>` / `bun x` / `bun exec` / `bun <file>`, `npx -c`,
install lifecycle scripts, package-manager options that pick another
package.json or workspace, client-library names in free text, and a usual
default or deploy branch pushed while another default is recorded).
`tests/must-ask.boundary.test.ts` — only the must-ask builtins carry a class
and every other builtin passes the gate with no card; real non-must-ask calls
raise none; each must-ask builtin's everyday call raises none; the tool loop
holds a post for the card, feeds the owner's no back to the model and runs a
files-write in the same round with no card.
`tests/must-ask.regression.test.ts` (imports only modules main has, so it
fails on main on what it checks) — with no owner configured a real
`discord-post-message` post is refused (`refused (AUTONOMY-10)`, exit 2) and
no request is sent, and a `git-push` of `main` to its remote is refused
(`refused (AUTONOMY-9)`) and the remote stays empty.
`tests/git.plugins.test.ts`, `tests/discord.requester-perms.test.ts` and
`tests/discord.allowed-mentions.test.ts` approve the card
(`tests/fixtures/must-ask.ts`) where they push `main` or post for real.

## Worker failovers in delegate / council tool data (REQ-plugins-080; AGENT-11)

`tests/agent.fallback.test.ts` ("a delegate or council worker's failover
reaches the lead …") — `createCouncilCommand` with a fake bin whose result
frames report a failover returns `data.modelFallback` with it once;
`runDelegateChild` returns the worker's failovers for the `delegate` data;
the lead's tool loop reports a `delegate` result's `modelFallback` as its own
(`via: "delegate"`). Fail on base (no field).

## Schedule-run stamps in the tool layer (REQ-plugins-065; DISCORD-SCHEDULE-1.a)

`tests/roles.team.test.ts` ("DISCORD-SCHEDULE-1.a: schedule-run stamps in
the tool layer") — with `CORVIDINHO_DISCORD_SESSION_ID=schedule_…`: the
owner stamp for the owner resolves `owner`; a team member stamped community,
team or owner resolves `community`; the same team stamp outside a schedule is
`team`. `runPlugin` runs the owner schedule's `github-issue-comment`
(dry run) and `files-write`, and refuses a team member's scheduled
`github-issue-comment` with the role refusal (exit 2). The catalog offers
the owner's schedule its allowlisted owner tools and `files-write` but not
`shell-exec`, and a team member's schedule no mutating tool.
- Fail on base: with the base's (af4597e) `src/plugins/roles.ts` swapped in,
  all three fail (a team stamp in a schedule resolves `team`); all pass on
  the branch.
## SpecSync change tools and own-change approve / finalize (REQ-plugins-518, REQ-plugins-519, REQ-plugins-065 / REQ-plugins-114 modified; AGENT-18, AGENT-18.a)

`tests/agent.repo-ways.test.ts` ("SpecSync change tools", "Corvidinho is a
fixed fact", "approve and finalize"): tool shapes (mutating / dangerous,
minTier, `agentTool: false`, `TEAM_WORK_TOOLS`, role gate by work flag),
`SDD_OFF_REFUSAL` and `--root` refusals with nothing spawned, `change new`
recording `opened` in the run ledger, `change status`, hi citations (none,
not captured, retired refused; captured spawns with the joined answer; other
questions and non-hi repos unchecked), `citedHiIds`, origin URL forms, the
checkout / worktree / look-alike rule, and every `selfLifecycleRefusal`
branch (outside Corvidinho, not this run's change, no green lane, WATCH,
schedule session and stamp, worker, community) plus the SAFE-1 denial and
the approve argv. `tests/roles.team.test.ts`: `TEAM_WORK_TOOLS` and the team
`/work` catalog (approve / finalize never offered).
`tests/agent.loop-guards.test.ts`: the four new tools are state-changing.
`tests/fledge.plugins.test.ts`: the builtin surface with a Fledge plugin is
under the ~9000-token budget. The fail-on-base proof is in
`specs/agent/testing.md`.

## Delegate and council workers are spawned with --here (REQ-plugins-117 / REQ-plugins-118 modified; SESSION-WORKTREE-1.a)

`tests/autonomous.delegate.test.ts` ("runs one worker …") and
`tests/autonomous.council.test.ts` ("voices are delegated read-tier …") —
every worker's argv has `--here` right after `task run`. Fail on base: both
fail.
