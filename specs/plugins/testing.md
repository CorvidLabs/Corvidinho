# Testing — plugins

See `tests/plugins.*.test.ts` and `tests/github.*.test.ts`. Prefer fixtures over live `gh`.
- memory-* plugin list + forget ACL fixtures (REQ-plugins-010).
- files-* / search-grep happy path + SAFE-2 deny + path escape (REQ-plugins-081..084).
- web-fetch SAFE-7 guard: every blocked range, DNS answers, redirect/rebinding, caps, content types via injected resolver/transport; loopback-only socket + TLS SNI fixtures (REQ-plugins-111).
- git-* plugins against temp repos (`git init` in mkdtemp, isolated git config)
  and a local bare remote at `<tmp>/acme/widget.git` gated via
  `CORVIDINHO_GITHUB_ALLOW_REPOS` / a temp allowlist file (REQ-plugins-182).
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

## discord-user-lookup (REQ-plugins-312)

`tests/discord.user-lookup.test.ts` — see also discord testing companion.

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
`lanes run verify` in the project root with the scrubbed env; `run <task> --
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
