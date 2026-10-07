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
`tests/agent.cloud-credentials.test.ts` — `shell-exec`, the three runners and
`fledge-lanes-run` / `fledge-run` start without cloud credentials (SAFE-21.b,
REQ-plugins-621): stand-in `kubectl` / `aws` / `gcloud` / `az` scripts called
by absolute path see no cloud key or value from the owner's env and none of
the owner's default files (`~/.kube/config`, `~/.aws/*`, `~/.config/gcloud/*`,
`~/.azure/*` under a fake HOME); `KUBECONFIG`, `AWS_SHARED_CREDENTIALS_FILE`,
`AWS_CONFIG_FILE` and `GOOGLE_APPLICATION_CREDENTIALS` are `/dev/null`,
`CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR` fresh dirs removed after the child, a
"login" one child writes never reaches the next, and `AWS_REGION` /
`GOOGLE_CLOUD_PROJECT` stay. All 7 tests fail with the base's sources.
The `specsync-check` tool (the verify lane's `spec-check` step, follow-up to
#373) is covered too: a child bun process with the owner's env runs it via a
stand-in `fledge` and a `fledge.toml` `spec-check` task, and via a stand-in
`specsync` with no such task; same assertions, and the owner's `GITHUB_TOKEN`
value is absent from the output. It fails with main's (`86d68cd0`)
`plugins/specsync/api.ts` (7 pass, 1 fail) and passes restored (8 of 8).

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

## Second-model review before every PR (REQ-plugins-092 added, REQ-plugins-117 modified; GITHUB-9, GITHUB-9.a)

`tests/work.review.test.ts` — temp git repos with a local bare `origin` at
`…/acme/review-fixture.git` (`tests/fixtures/review-cycle.ts`), dry-run
`github-pr-create` (the branch's tree read with `git ls-remote`), a scripted
`PrReviewRun` or a scripted provider fetch, the test data dir's DB. No
network, no real tokens.

- Reviewer: configured models listed in `CORVIDINHO_LLM_MODEL`, `_READ`,
  `_TOOL`, `_CODE` order, each label once; authors skipped by model id across
  kinds; an entry without its key skipped; null when only authors remain;
  would-be reviewer keys (`CORVIDINHO_REVIEW_MODEL`, …) are never read.
- `reviewTree`: an edit, a staged new file and a deletion give the tree a
  commit of the tracked files then has, an untracked file left out; `git
  status` and the staged list unchanged. An untracked scratch file beside the
  pushed branch neither blocks the PR nor reaches the reviewer; a committed
  `.env.local` / `config/credentials.json` / `.env.production` is named to the
  reviewer, its content never sent.
- Findings: JSON, fenced JSON, bullets, clean replies, other text as one
  finding, capped at 10 with the rest counted, scrubbed before the cut; the
  review messages scrub the diff and fence it so it cannot close the fence.
- With a run model: round 1 findings hold (`reviewHold: findings`, round 1 of
  3, reviewer, fenced findings, `data.review` counts only); a committed and
  pushed change gets round 2, clean, and the PR body has the section (2 of 3
  rounds, the finding, `M  src/app.ts` after round 1, round 2 raised nothing,
  no `$`/`USD`/tokens) before the attribution; decline (same tree) opens with
  "Not changed: the tree was left as it was after round 1"; round 3 ends the
  cycle (`A  src/step1.ts`, `A  src/step2.ts`, "round 3 of 3 ends the
  review") and the same tree reopens with no 4th call; unpushed edits, a
  branch not on the remote, no changes against `main` and a non-git cwd each
  refuse in one line; no second model refuses with the GITHUB-9.a line and no
  call; an author recorded for the branch is never its reviewer; a provider
  HTTP 500 refuses with `reviewer-model failed (HTTP 500)` and none of the
  provider text; a diff over 200 KiB refuses with no call; a completion with
  no model failure rejects with `ReviewSpendStop`; none of the refusals
  records a round; a caller heading `## Second-model review` is quoted; live
  mode with no token fails before any review call.
- Without a run model: no cycle, a cycle for another tree, or an open cycle
  refuse in one line; a finished cycle for the pushed tree opens and lists
  its findings.
- Every round since the last PR opened: a cycle that ended clean on an
  unpushed edit, then a new cycle on the pushed, changed tree — the PR lists
  round 1's finding, `M  src/app.ts` and `A  src/more.ts`; rounds marked
  opened (`markReviewOpened`) are not listed again; a live `pulls.create`
  (mocked fetch) marks the rounds it listed.
- `githubBranchTree` (mocked Octokit fetch): the head commit's tree, an
  `owner:branch` head on that owner's repo, null on 404. `SCRUB_TARGETS`
  lists `pr_review_rounds` and `pr_change_authors`.
- Delegate plumbing: `buildDelegateSpawn` passes `authors` as
  `CORVIDINHO_DELEGATE_AUTHORS` and drops an inherited value;
  `delegateAuthorsFromEnv` / `workerModelsFromResult` validate and bound.

Updated: `tests/github.write.plugin.test.ts` (the attribution cases run in a
reviewed fixture repo; the section sits between the body and the footer, one
footer), `tests/roles.chat.gates.test.ts` ((b): past SAFE-1 and GITHUB-6 the
admin call reaches the GITHUB-9 gate, never the role refusal; with a finished
review it opens).

Fail on base (the nine modified sources at `9ea766b` swapped in,
`src/work/review.ts` kept): `tests/work.review.test.ts` cannot load
(`githubBranchTree` missing); `tests/github.write.plugin.test.ts` 2 fail,
`tests/roles.chat.gates.test.ts` 1 fails. With the missing exports stubbed so
it loads, `tests/work.review.test.ts` gave 8 pass, 23 fail (the 8 are the new
module's pure units and the token check). `tests/work.pr.test.ts` only adapts
(it seeds reviews with the fixture's `fullWorkTree`). The second-pass cases
(tracked-only tree, secret paths, earlier cycles, marking, checkout authors)
fail with this change's own pre-fix sources (`69257ea`): 9 fail. Restored:
the four files 82 of 82.
## Tool output keeps a run alive (REQ-plugins-125, AGENT-12)

`tests/agent.limits.test.ts` ("tool output (spawnCapped …)"): a child that
prints every 0.1 s for 1.5 s keeps a 500 ms idle watchdog from firing; a
silent 1.2 s child lets it fire. Fail on base: the printing child lets it
fire.

## Non-git root instructions and read-only others (REQ-plugins-110, REQ-plugins-115, AGENT-1.b, AGENT-1.a)

`tests/plugins.nongit-project-dir.test.ts` (6 tests): in a non-git folder
`files-write` / `files-edit` / `files-delete` refuse the root `AGENTS.md` and
`CLAUDE.md` (the names, the absolute path, a path under the name, a missing
file, a symlink's target, a hard link) with `refused (AGENT-1.b)` for the CLI
and the owner, other files and `sub/AGENTS.md` are written, SAFE-2 still
refuses, a git project's root copy stays writable; `actingWorkTask` needs a
git work tree; a team member's `/work` writes there get the role refusal and
work in a git repo; the owner writes there. Fail on base: 4 of 6 fail; the
SAFE-2 and git-project cases hold on both. `tests/roles.team.test.ts` now runs
in a git fixture dir.
## File tools leave hi/ alone in hi repos (REQ-plugins-520, AGENT-18 hi guard)

`tests/agent.hi-guard.test.ts` through `runPlugin`: in a temp hi repo,
`files-write` (relative, `./`, absolute, a new file), `files-edit` and an
allowlisted `files-delete` under `hi/` all refuse with
`refused (AGENT-18): 'hi/…' is under hi/, …` (exit 2) and leave the file
and `hiChangesSince` unchanged; `files-read hi/agent.md` and a write to
`src/app.ts` still work; a write through `docs/criteria -> ../hi` is refused
where it lands; in a repo whose `hi/` has no front matter the write goes
through; a non-git hi project refuses too; inside a `/work` talk worktree the
refusal holds mid-run.
- Fail on base (b84c75f's `plugins/files/commands.ts` and
  `protectedPaths.ts` swapped in): the three file-tool cases fail (the writes
  go through); restored they pass.

## github-pr-create inside a run opens no PR while hi/ changed (REQ-plugins-521, AGENT-18 hi guard)

`tests/agent.hi-guard.test.ts`: inside a `runTask` in a temp hi repo, a
criterion committed through the shell makes a dry-run `github-pr-create`
(`CORVIDINHO_GITHUB_DRY_RUN=1`, a temp repo allowlist) refuse with
`refused (AGENT-18)`, exit 2, naming `criteria AGENT-23` and "this run opens
no PR", before any review; with hi/ untouched inside a run, and with a dirty
hi/ edit but no run in progress, the hi guard does not refuse (GITHUB-9
answers next).
- Fail on base (b84c75f's `plugins/github/commands.ts` swapped in): the
  refusal case fails (no AGENT-18 refusal); restored it passes.
## Web search through Brave (REQ-plugins-318 / -3181 added, REQ-plugins-065 / -111 / -113 modified, PLUGIN-7 / PLUGIN-9)

`tests/web.search.test.ts` (no network: a fake resolver and a fake transport
that answers like Brave, the fake key `test-key-not-real`, in-memory ledger
DBs):

- Gating: `web-search` is dangerous, minTier 1, next to `web-fetch`; the
  catalog offers it only when allowlisted, at tool/code tier, never at read
  tier; owner, no role session and team (chat and `/work`) get it, community
  never, team still without `web-fetch`; `TEAM_SEARCH_TOOLS` is `web-search`
  only; SAFE-1 deny with a `denied` audit row, allowlisted runs audited
  `started` / outcome; a community role session is refused at `runPlugin`, a
  team one reaches the handler; a schedule the owner created is offered it,
  a team member's schedule is not (DISCORD-SCHEDULE-1.a).
- Request: one GET to the pinned public address of `api.search.brave.com`
  `/res/v1/web/search` with `q`, `count` (default 5, `--count 20`),
  `safesearch=moderate` and `freshness` when given, the key only in
  `X-Subscription-Token`; usage errors (query words together with
  `--query`, a `--` term outside `--query` among them), the `not-configured`
  result (no, blank, malformed key; the error starts `web-search
  not-configured: web search is not configured`) and secret-carrying queries
  (the key split by a joiner too) send nothing.
- Output: hostile hits only inside the untrusted web fence (unique end
  marker, HTML / entities / controls reduced), nothing of a hit outside it,
  attribution in the summary, at most `count` hits, non-http and
  credentialed URLs dropped, `(no results)`; the visible reply line "Search
  by Brave" is the reply path's (REQ-agent-318, `specs/agent/testing.md`).
- SAFE-6: the key echoed by results, error bodies, a non-JSON body, a
  transport error or a DNS error never comes back; through `runPlugin` the
  result and the audit rows hold neither the key, the request path, the
  header name nor the pinned address; the key split by a zero-width space,
  a soft hyphen, a bidi isolate, a tag character or BEL in a title, URL,
  description and age, in a resolver answer a SAFE-7 refusal names, or
  straight into `fenceSearchResults`, never comes back whole (the scrub runs
  last); the env drop lists (workers, verify lane, Fledge children) and
  `formatErrorLine`.
- Keyed JSON GET (REQ-plugins-3181): http, other hosts, a look-alike host,
  port 8443 and URL credentials refused before DNS; non-public answers
  refused before connecting; 301/302/303/307/308 refused after one dial,
  Location not echoed; non-JSON, gzip, missing content type, malformed JSON
  and oversized bodies refused; a stalled transport times out; the run's
  abort stops it; in both cases the transport's own request signal is
  aborted; a body that fails mid-read is `network` with the host and
  `ECONNRESET` only; `web-fetch` unchanged for any public host with its own
  headers.
- Brave error mapping (401, 403, 422 `SUBSCRIPTION_TOKEN_INVALID`, 422
  `VALIDATION`, 429, 503) without server text; the run's abort through the
  handler ends a pending search `aborted` and aborts the transport's signal,
  and a run already stopped sends nothing; an unexpected failure is the fixed
  `web-search unexpected: the search failed unexpectedly` line.

Updated: `tests/web.fetch.test.ts` (REQ-plugins-111: `web-search` now
exists as its own command), `tests/roles.team.test.ts` (REQ-plugins-065:
`roleAllowsPlugin` over every plugin with the team search rule; the team
catalog offers `web-search`, the community catalog does not).
`tests/fledge.plugins.test.ts` keeps the whole tool surface (builtins plus a
fake Fledge plugin) under `TOOL_SURFACE_BUDGET_TOKENS` (9000 on main since
AGENT-18) with `web-search`'s short description (builtins alone: 8078 tokens,
7951 on main 0aeb345; the reply line adds nothing to any tool schema).

## GIF search through GIPHY (REQ-plugins-3182 added, REQ-plugins-318 / -3181 / -065 / -113 modified, PLUGIN-8 / PLUGIN-9)

`tests/gif.search.test.ts` (no network: a fake resolver and a fake transport
that answers like GIPHY's Tenor-compatible search, the fake key
`test-key-not-real`, in-memory ledger DBs):

- Gating: `gif-search` is dangerous, minTier 1, no must-ask entry, in
  `NO_STATE_CHANGE_TOOLS`; the catalog offers it only when allowlisted, at
  tool/code tier, never at read tier; owner, no role session and team (chat
  and `/work`) get it, community never, team still without `web-fetch` and
  `discord-send-file`; `TEAM_SEARCH_TOOLS` is `web-search` and `gif-search`;
  SAFE-1 deny with a `denied` audit row, allowlisted runs audited `started`
  / outcome; a community role session is refused at `runPlugin`, a team one
  reaches the handler.
- Request: exactly one GET (no GIF downloaded) to the pinned public address
  of `api.giphy.com` `/v2/search` with exactly `q`, `key`,
  `client_key=corvidinho`, `limit` (default 5, `--limit 10`),
  `media_filter=gif,tinygif` and `contentfilter=medium`, and only the fixed
  API headers; `cats&contentfilter=off&rating=r` and similar stay the `q`
  value with one `contentfilter=medium`; `--contentfilter`, `--rating`,
  `--media-filter`, `--download`, bad limits, words with `--query`,
  `--query` / `--limit` given twice and missing / 51-character queries are
  usage errors that send nothing; no /
  blank / spaced / 5-character key → `not-configured`; secret-carrying
  queries (the GIPHY and Brave keys, a Discord token, a `ghp_` token, the key
  split by a joiner) refused before anything is sent.
- Output: titles and links only inside the fence, in GIPHY's order (a hostile
  title, a guessed end marker and control characters included), nothing of a
  result outside it, `postAs: "link"`, the guidance to post one only when
  someone asks, as a link, and "Powered By GIPHY" in `data` / the summary,
  and a description that says `only when someone asks`; media-link
  validation (http, look-alike and suffix hosts, `giphy.com` page URLs,
  `media5`, credentials, port 8443, trailing dot, over 2048 characters, and
  Discord markdown or a mention after the host — `)[click](…)` in the path or
  query, `<@…>`, `**`, `|`, `@everyone` — dropped; a fragment cut off;
  GIPHY's own `?cid=…&rid=…&ct=g` links kept whole; `tinygif`-only results
  keep their `Small GIF:` line; results without a valid link dropped and
  counted in `data.dropped` and the summary; at most `--limit`); results
  that all fail the link check are an ok `(no results)` that says how many
  were left out, while a real empty search says nothing of the kind;
  `(no results)`; a 2xx `error` body → `api-error`, a body without
  `results` → `bad-response`.
- SAFE-6: GIPHY echoing the key or the request URL in titles, links, a 401 /
  500 / 2xx error body, a non-JSON body, a redirect Location, a transport
  error or a DNS error never brings back the key or the request's query
  string (GIPHY's own echo inside the fence reads `key=[redacted:env-secret]`,
  and no error names the path, `key=` or the Location); the key split by a
  zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL
  never comes back whole; through `runPlugin` the result and the audit rows
  hold neither the key, the path, `key=`, the API host nor the pinned
  address; the env drop lists (workers, verify lane, Fledge children),
  `redactSecretEnvValues` and `formatErrorLine`.
- Transport: a non-public answer for `api.giphy.com` is refused before
  connecting (exit 2), a redirect after one dial (exit 2, Location not
  echoed); 401 / 403 / 400 / 422 / 429 / 503, `text/html`, malformed JSON, a
  body over the byte cap (`too-large`) and a failed connection (`network`,
  host and fixed reason only) map to fixed codes; the run's abort ends a pending search (`aborted`, the
  transport's signal aborted), a stalled one times out, a run already stopped
  sends nothing; an unexpected failure is the fixed line.
- SAFE-8 ($0 rows): a 2xx settles `actual` at 0, also for an `error` body
  or a body without `results`; an HTTP error or a refusal before connecting
  settles `failed`, a network failure `estimated`; an invalid
  `CORVIDINHO_DAILY_SPEND_CAP_USD` stops the search with the spend-cap ask,
  with no DNS, request or ledger row.
- Docs: `.env.example` has `# GIPHY_API_KEY=`; `docs/DISCORD-GO-LIVE.md` has
  the `gif-search` table row, `GIPHY_API_KEY`, `contentfilter=medium` and
  "Powered By GIPHY".

Updated: `tests/roles.team.test.ts` and `tests/web.search.test.ts`
(REQ-plugins-065: `TEAM_SEARCH_TOOLS` is `gif-search` and `web-search`; the
team catalog offers `gif-search`, the community catalog does not;
REQ-plugins-318: `--query`, `--count` or `--freshness` given twice is a
usage error). `tests/fledge.plugins.test.ts` (REQ-plugins-114, unchanged
test) keeps the whole tool surface (builtins plus a fake Fledge plugin)
under the default budget of 9000: `gif-search` adds about 92 tokens, and
shorter `web-fetch` and `web-search` descriptions (the same rules, less
wording) make room for it.

## Roles on GitHub in the tool layer (REQ-plugins-1201 added, REQ-plugins-065 modified; IDENTITY-12.a)

- `tests/watch.github-roles.test.ts` (with the WATCH cases under the watch
  module): the env a real WATCH spawn hands its child, applied to this
  process.
  - "owner and team by GitHub numeric id": `resolveActingIsAdmin` /
    `resolveActingRole` give owner for the owner's id, team for the team
    member's; the owner stamp on a stranger's, a re-registered login's or a
    declared community person's id, a team stamp on the owner's id, a
    community stamp, a login with no id, the owner's Discord id in a WATCH
    env, and no WATCH session id all give community.
  - "a Discord run never uses the GitHub keys": surface `chat` with the
    owner's GitHub id and no Discord actor → community; with the owner's
    Discord id → owner.
  - "live": a team member demoted in the file, on GitHub `deny_users` by
    login or by id, on `[discord].deny_users` or in `DISCORD_MUTED_USER_IDS`
    → community at the next call, team again once restored; the owner with no
    `[owner] github_id` or an unreadable file → community.
  - "team on GitHub": never a `/work` task (`actingWorkTask` false with a
    stale stamp), review tools allowed, `files-edit` and `git-push` refused;
    the owner gets both.
  - "the owner's must-ask call raises the owner's Approve card": a mutating
    `prod` must-ask command run through `runPlugin` raises one `mustask` card
    titled `… · from watch:watch_w1`, runs once on approval, and is refused
    with nothing run on a deny. Team, community and a re-registered login's
    run get `not allowed for your role` and no card.
  - WATCH limits: `secretPathsRefused` is true for the owner's WATCH run and
    false for the owner's Discord run; `shellToolsGate` refuses the owner's
    WATCH run; a `delegate` worker built from it resolves community.
- `tests/agent.safe3a-owner-shell.test.ts` "WATCH, a schedule, a delegate
  worker and a local CLI run: refused" (updated): a watch stamp with only the
  owner's Discord id is community now; the owner's GitHub-stamped WATCH run
  (`CORVIDINHO_WATCH_SESSION_ID`, `[owner] github_id`) is offered
  `files-delete` but never `shell-exec` / `fledge-run` ("WATCH runs never get
  them").
- Fail on base: see the watch module's entry (9 of 12 fail with the base
  sources, 12 of 12 pass restored).
## shell-exec never approves, reviews or finalizes a SpecSync change (REQ-plugins-1818, AGENT-18.a)

`tests/shell.sdd-lifecycle.test.ts` through `runPlugin` (`shell-exec`
allowlisted): temp dirs only, a fake `specsync` on PATH that logs its argv and
changes the change folder like the real one (approve writes `approvals.json`,
review `review.json`, finalize / ship archive the folder), fake `bunx` / `npx`
that log and run it; every refused command starts with `touch spawned`.
Each refusal is exit 2, `shell-exec refused (AGENT-18.a): …` carrying
`HUMAN_LIFECYCLE_LINE` and "never does in any repo", `data.rule`
`AGENT-18.a` with its `step` (null when it can't be read) and `script`, and
leaves no marker, no specsync or runner call, the `.specsync/` tree
byte-for-byte unchanged, no `approvals.json` / `review.json` and no
`.specsync/archive`:
- approve / review / finalize / ship in a SpecSync repo, in a plain folder
  (no git, no SpecSync) and on Corvidinho (test seam) with the run's ledger
  holding `c1` right after a green lane (`selfLifecycleRefusal` would let the
  plugin approve it);
- through `sh -c`, `bash -c`, `eval`, `$(…)`, backticks, a function, `if`,
  a pipeline, quote removal (`appr\ove`, `'fin'alize`) and `$'approve'` (dash
  reads it as an expansion: step null);
- behind `env`, `timeout`, `nohup`, `xargs`, `sudo -u`, `exec`, `command`,
  `find -exec`, the absolute path, `./tools/specsync`, `../tools/specsync`
  after a `cd`, a symlink `./bin/ss`, `bunx`, `npx -y specsync@6.0.0`,
  SpecSync's options before the step, and an expanding command word;
- a step that expands (`"$S"`, `$(echo approve)`) or that xargs supplies;
- in-root scripts: `sh x.sh`, `bash ./x.sh`, `. ./x.sh`, `./y.sh`, naming
  the script.
Read-only `change status|list|show|check|ship-status`, `specsync check`
(with `--require-coverage 100`), options before `status` and
`xargs specsync change status` run (the fake logs each argv, the tree is
unchanged); words that only mention a step (`echo approve …`, a `grep`
pattern, a `change new` / `change answer` text) run. `shellProdWhy` raises
no Approve card for `specsync change approve c1 && kubectl get pods`
(`kubectl get pods` alone still asks). The settle path: on Corvidinho with the
verified ledger, `specsync-change-approve` still spawns
`change approve c1 --actor corvid-agent` directly and writes
`approvals.json`. A unit test of `firstLifecycleStep`: option values,
`--root change change review`, `cargo run --bin specsync -- change` (and
`--bin=specsync`), a here-doc handed to `sh`, `watch -n 5 specsync …`,
`pnpm dlx @corvidlabs/specsync@6`, expanding steps and command words,
`specsync check change approve` (not a step), `echo specsync change approve`
(fails closed), `specsync-helper` (not specsync), separate commands, and
the `bun -e` residual.
- Fail on base (e1a24ed2's `plugins/shell/commands.ts` and
  `plugins/shell/must-ask.ts` swapped in, `sdd-lifecycle.ts` removed): 9 of 11
  fail (every refusal case, the Approve-card case and the unit test); the
  read-only and settle cases pass on both. Restored: 11 of 11 pass.
- `tests/agent.repo-ways.test.ts` (the `runTask` settle cases, REQ-agent-519)
  passes unchanged.
## The hi/ refusal names the owner's card and hi-draft (REQ-plugins-520 modified; AGENT-18 hi drafts)

`tests/agent.hi-guard.test.ts`: the `files-write` refusal under `hi/` now
says criteria change only through a capture the owner approves on a card
(and points at `hi-draft`); every other file-tool case is unchanged and
passes (20 of 20).
## The /work round driver shares the review step (REQ-plugins-092 modified; GITHUB-9, GITHUB-9.a)

`tests/work.review.test.ts` ("/work: an owner or team run drives the review
rounds", temp repos with a bare origin, scripted provider): the untracked
new file is in the reviewed diff, the reviewer gets `Title: Corvidinho /work
task` and never the task text, the rounds are stored (round 1 open with its
finding, round 2 `clean` with `M  src/greet.ts` changed), `workTreeReviewed`
is true for the tree /work ships, and the /work PR body has the section; a
spend-cap stop gives the hook's `ask` when the run left one, else a refusal,
and records nothing; `workReviewFeedback` stays within 3800 characters
(under the 4000 verify feedback cap) with its fence whole and later findings
counted. The existing `github-pr-create` cases (run model, no run model,
declined, max-rounds, refusals) still pass on the shared `reviewStep`. Fail
on base: the file cannot load (the `/work` exports are missing).
## `.trust.toml` is SAFE-2 protected (REQ-plugins-525 added; AGENT-18 Trust clause)

`tests/agent.trust-verify.test.ts` (".trust.toml is SAFE-2 protected like
fledge.toml"): `isProtectedPath` for `.trust.toml` in any directory and case,
not for `trust.toml`, `docs/trust.md` or `.trust.toml.bak`; `files-write`
(relative, `./`, absolute, new `sub/.trust.toml`), `files-edit` and an
allowlisted `files-delete` refuse with SAFE-2 (exit 2) and leave the file
unchanged; `files-read .trust.toml` and `files-write trust.toml` work;
`discord-send-file`'s `fileAttachment` refuses it with SAFE-2; `git-commit`
refuses to stage the deletion of a tracked `.trust.toml`. Both tests fail
with the base sources.

## A WATCH run never writes the watcher's checkout; its audit actor is its GitHub trigger (REQ-plugins-1202 / REQ-plugins-1203 added, REQ-plugins-1201 modified; IDENTITY-12.a follow-up to #374)

- `tests/watch.github-roles.postreview.test.ts` (with the watch cases under
  the watch module): the env a real WATCH spawn hands its child, applied to
  this process; a temp git checkout standing in for the project root.
  - REQ-plugins-1202: the owner's WATCH `files-edit`, `files-write`,
    `files-delete`, `git-branch-create` and `git-commit` (tier `code`,
    allowlisted) are refused with "writes the watcher's own checkout", and
    the checkout's file, branches and `git status` are unchanged; the
    owner's Discord run still writes a file there.
  - REQ-plugins-1203: a team member's WATCH `github-pr-review` (dry run)
    appends `started` / `ok` rows with actor `github:4242` and surface
    `watch:watch_w1`; the owner's WATCH must-ask card has requester
    `github:8268288`, and after the owner denies it the same call from the
    local CLI raises a new card (requester `local`) and runs on approval.
- `tests/audit.log.test.ts` (updated): `auditContextFromEnv` with only a
  WATCH session id gives `github:(unknown)`, with nothing `local` / `cli`.
- Fail on base: main's `src/plugins/{run,roles}.ts` fail the checkout case;
  main's `src/audit/log.ts` fails both audit cases. Restored: they pass.
## GITHUB-7 typed github-pr-merge (REQ-plugins-099)

#395's `tests/github.merge.plugin.test.ts` (12 tests against its
`mergeOwnGreenPr`) is folded into `tests/github.self-merge.test.ts` by the
GITHUB-7.a change below, whose gate replaced `mergeOwnGreenPr`: the block
"GITHUB-7 cases carried over from #395" (14 tests, fake Octokit, no token)
keeps `isCorvidinhoRepoSlug`, dry-run skips `pulls.merge`, refuses outside
Corvidinho with no GitHub call, refuses other authors, surfaces merge API
errors with no bypass retry, plugin listing is dangerous minTier 1, SAFE-1
denies without allowlist and the usage error without a PR number as they
were; the squash merge with no admin or bypass field, non-green CI (a
failing `ci` check) and draft/closed/not-mergeable now run on a GITHUB-7.a
green PR and name their own reasons (`ci-red`, `draft`, `not-open`,
`not-mergeable`), the builtin's outside-Corvidinho refusal names `--sha`,
and two cases are new: the PR #395 would have merged (feature branch, no
person's ready, only a `ci` check) is refused (`not-own-branch`, then
`not-marked-ready`, `ci-smoke-missing`, `not-mergeable`), and `--method
squash` is accepted while `merge` / `rebase` are usage errors.
`tests/plugins.list.smoke.test.ts` expects `github-pr-merge` in `plugins list`.

## It merges its own Corvidinho PR only when the owner asks (REQ-plugins-099 / REQ-plugins-097 / REQ-plugins-095 modified; GITHUB-7, GITHUB-7.a)

`tests/github.self-merge.test.ts` (125 tests, #395's carried-over block
above included): a fake GitHub client
(`makeGithubPrMergeCommand({ client })`, no network or token), a temp data
dir and allowlist file, the real must-ask gate, card store and SAFE-5 chain.
- A green PR (own token, own `talk/…` branch, not draft, marked ready by a
  person, no gate path,
  `smoke` + `spec-sync` from GitHub Actions passed at the head, `clean`) with
  an approved `mustask-merge` card merges once via `pulls.merge` with the
  named sha, `squash` and `<title> (#12)`; the reply names the merge sha;
  `started` + `ok` rows. On the bridge's real card engine Approve alone merges
  nothing and Approve plus the one-time code merges once.
- Each refusal reason (a PR it opened ready that no person marked ready, one
  only an app marked ready, or one an app marked ready last after a person's
  ready and a draft again, is `not-marked-ready`) raises no card, merges
  nothing and leaves one `github-pr-merge:<reason>` `denied` row; a denied
  card leaves
  `card-denied`; a PR turned draft while the card waits is refused after
  `started`; a run stopped after the Approve, while the gate re-runs, merges
  nothing (`started`, then `aborted`); a GitHub 405 is `github-refused`; a
  dry run asks and merges nothing; an error while checking (a client factory
  that throws) is `github-error` with no card (never a fallback prod card).
- `loadBuiltins` registers merge.ts's `githubPrMerge` as the one
  `github-pr-merge` and no other GitHub command list carries the name; a
  stray same-named command put first in `githubCommands` cannot take it
  (`loadGithubPlugins` registers the gated one first).
- The caller check refuses WATCH (a WATCH session id, a `watch` stamp, and
  the owner's own GitHub-triggered run as #374's WATCH spawn stamps it), the
  owner's own schedule, a worker, a missing surface stamp, a muted owner,
  team and spawned local runs before any GitHub call; a non-Corvidinho repo
  is refused before any call. Through `runPlugin` the owner's WATCH run
  passes the role gate (IDENTITY-12.a) and is refused by the tool with one
  `github-pr-merge:watch` row and no card.
- Gate paths (`.trust.toml` in any folder and case, `CLAUDE.md` and
  `tsconfig.json` in any folder, and every `SELF_MERGE_CODE` file —
  `repo-ways.ts`, `delegate.ts`, `api.ts` and the registration `index.ts`
  included; ordinary paths such as
  `trust.toml`, `package.json` and `src/agent/tools.ts` are not gates), talk-branch names
  against `generateTalkBranchName`, and the required check names against
  `.github/workflows/ci.yml` / `spec-sync.yml`.
- `tests/must-ask.boundary.test.ts`: `github-pr-merge` is among the
  must-ask builtins.
- Fails on the base: on main after #395 (54d6a6c7) the file does not load
  (main's `plugins/github/merge.ts` has no `checkSelfMerge`,
  `makeGithubPrMergeCommand` or `selfMergeCallerRefusal`). On 86d68cd0,
  before #395: without `plugins/github/merge.ts` the file does not load; with it but the base `run.ts`, `tools.ts`, `execute.ts`,
  `events-ndjson.ts`, `loop-guards.ts`, `ask.ts`, 33 of 114 tests (with
  `tests/must-ask.boundary.test.ts` and `tests/agent.loop-guards.test.ts`)
  fail. Restored: 114 of 114 pass.
## My memory forget / override by id on a DM card (REQ-plugins-183 added, REQ-plugins-011 modified; SAFE-18.a, SAFE-4/19/20)

`tests/memory.forget-card.test.ts` (17 tests; the real card engine with
`memoryApprovalKind` and recording DMs, a temp data dir, no token, no
network): the owner's `memory-forget` in a Discord conversation raises one
`memory` card (destructive) DMed to the owner with the exact action, the
target (id, category/key, owner scope, last changed) and the amount; Approve
alone forgets nothing, Approve + the one-time code forgets it once (request
`used`; `memory-card`, `approval-code-issue`, `memory-approve` and the
`memory-forget` tool rows on the audit trail); Deny, a lapse (and a late
Approve), a stopped run (exit 130) and a memory changed after the card went
out change nothing. `memory-override`: the new text goes out first, word for
word, inside one code block headed as data, then the card; Approve + code
stores exactly it; backticks can't end the block; a secret is scrubbed on the
card exactly as stored; Deny keeps the old text. No card and no change: the
local CLI (also with `--confirm` and a token in the env) and the owner's
schedule run refuse with the bridge line; a typed token in the owner's chat is
refused; a card that can't be raised or read refuses with a SAFE-6 scrubbed
reason and changes nothing; a non-owner (also with a forged ADMIN bit) is
refused as before with no card, and their `memory-forget-me` still records a forget request. A card
whose waiting run is gone closes as a no. The fake model's `memory-forget`
call through `createTaskExecute` waits for the card and succeeds once
approved with the code. The argv hint and descriptions name the card and no
`--confirm`.

`tests/memory.plugins.test.ts` (two-phase cases replaced): the owner's forget
asks on the card and forgets once approved (no token, no content in the
result); `--confirm` in any form is refused with no card; an override stores
exactly the card's text; Deny and no answer change nothing; override without
text is a usage error with no card; `--confirm` after `--` is the override's
text, not a token. The ACL cases (argv identity, empty admin, non-owner,
deny-listed / muted owner, admin lists, the bridge bit, SAFE-1) are unchanged.

Fail on base: with main's (`85871fa4`) `plugins/memory/commands.ts`,
`src/discord/agent-client.ts` and `src/agent/tools.ts` swapped in (the new
card module kept loadable), 21 of the 43 tests in
`tests/memory.forget-card.test.ts`, `tests/memory.plugins.test.ts` and
`tests/memory.spawn-env.test.ts` fail (no card is raised, the first call
returns a token, `--confirm` is accepted, the spawn passes the typed token,
the hint names `--confirm`); with every touched source swapped back to main
the two card files cannot load. Restored: 43 of 43 pass. REQ-plugins-010
(modified): the forget / override ACL fixtures in `tests/memory.plugins.test.ts`
now refuse without the owner's approved card instead of a token.
