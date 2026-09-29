# Lesson bundle — three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65)
- **Kind**: Feature
- **Specs**: plugins, agent, discord
- **Paths**: hi/identity.md, hi/admin.md, hi/roles.md, INTENT.md, src/identity/people.ts, src/plugins/roles.ts, src/plugins/run.ts, src/plugins/githubPublic.ts, plugins/files/commands.ts, plugins/github/commands.ts, plugins/github/public-docs.ts, plugins/github/index.ts, src/agent/tools.ts, src/agent/execute.ts, src/discord/permissions.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/admin.ts, src/discord/admin-people.ts, src/discord/slash-commands.ts, tests/roles.team.test.ts, tests/github.public-docs.test.ts, tests/discord.admin-slash.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, allowlist.example.toml, STATUS.md
- **Acceptance**: Each declared person has exactly one role, read from role = "team" | "community" in the owner's people list (no role key = community; the owner is always owner; role = owner on anyone else grants nothing; a list or unknown value skips the entry), and only the owner sets it, by editing the file or with owner-only /admin people role (handler re-check, SAFE-5 admin-people-role rows before the write, fail closed) (IDENTITY-8, ADMIN-3.b); the tool layer resolves the acting role on every call and surface (resolveActingRole in runPlugin and the task-run catalog, re-reading the owner config and people list, the spawn's CORVIDINHO_ACTING_ROLE stamp only lowering it): the owner keeps every tool as ADMIN today (IDENTITY-9); team (Discord chat, button picks, /session start and /work of a declared team member) gets the read tools plus github-issue-comment / github-pr-review on GITHUB-6-allowlisted repos only, files-write / files-edit in its /work run, the /work draft PR, and only its own memory (IDENTITY-10); community (declared community, undeclared, WATCH, schedules, workers, muted or deny-listed) keeps today's read/chat catalog with no mutating tool (IDENTITY-11/12); community site/roadmap sources are the public repo docs (README, docs/, STATUS, CHANGELOG via github-docs-read) and the public issues and milestones of allowed public repos (github-issue-list, github-milestone-list), with no site URL (ROLES-CHAT-8.a); every existing ROLES-CHAT test stays green; tests/roles.team.test.ts, tests/github.public-docs.test.ts and tests/discord.admin-slash.test.ts cover each and fail on the base sources

## Evidence

- Verification commit: `7b0d2066c2d1a6feabc10e9709e104d20095d2a8`
- Base commit: `72fec65395d657fef8c11ace63bd2205baa83f23`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #65 (ROLES: owner / team / community gate every tool, milestone M1
"Knows everyone"), stacked on #36 (declared people, branch
`claude/m1-36-contacts`), whose registry, resolver and `/admin people`
commands this reuses. Leif confirmed the criteria in the 2026-09-28 interview
(round 6: "#65 roles: capture IDENTITY-8..12 as written"; round 9: ROLES-CHAT-8
sources; round 10: ADMIN-3 knobs editable via /admin include people + roles).
They were captured in this PR's first commit (`hi`, ROLES-CHAT-8.a by hand):

- **IDENTITY-8** "Each declared person has exactly one role (owner, team or
  community), and only I set it."
- **IDENTITY-9** "The owner can use everything, subject to the must-ask list."
- **IDENTITY-10** "Team members get work tasks, reviews, and only their own
  memory and briefings."
- **IDENTITY-11** "Community members get Q&A and announcements only, with no
  mutating tools."
- **IDENTITY-12** "The role is checked in the tool layer on every run and
  surface; anyone undeclared is community at most."
- **ROLES-CHAT-8.a** "Community sessions may read the public repo docs
  (README, docs/, STATUS, CHANGELOG) and the public issues and milestones of
  allowed public repos, and nothing else as site or roadmap."
- **ADMIN-3.b** "As owner I can set each declared person's role with /admin;
  every change is audited."

Gap on the stacked base: two tiers only (ROLES-CHAT): the owner is ADMIN and
everyone else is non-ADMIN with read/chat tools; `resolvePerson` returns
`role: owner` only; no role key, no `/admin people role`; `/work` ships a PR
for the owner only; community "site / roadmap" is unspecified in the prompt
and there is no milestone or repo-docs reader.

Settled constraints: owner admins, the team works (IDENTITY-2 stands for
admin slash); v1 off-chain (Discord + GitHub ids only, no AlgoChat / wallet);
every existing ROLES-CHAT test stays green; no schema bump; #232 / #233 scope
untouched; #36's active SpecSync changes are left alone.

## From the change's design.md

# Design

- **Store (IDENTITY-8).** A `role` key in each `[people.<id>]` entry of the
  allowlist file #36 already reads (JSON `role`); no new file, env var, table
  or schema bump. One string, one of owner / team / community; a list or an
  unknown value makes the entry unreadable (skipped whole, like any bad value,
  so it never reads as a wider role). No key ⇒ community. The owner role
  belongs to the configured owner (`[owner]` / env, IDENTITY-1): the owner's
  person is owner whatever it declares; `role = "owner"` elsewhere is
  community plus a problem line.
- **Resolver (IDENTITY-12).** `resolveActingRole(env)` in
  `src/plugins/roles.ts`, next to the existing ADMIN re-check: owner via
  `resolveActingIsAdmin` (unchanged); else team only when the spawn stamp
  (`CORVIDINHO_ACTING_ROLE`) allows team AND the people list, re-read now,
  declares the acting Discord id team (not muted, not deny-listed); else
  community. The stamp is a per-surface cap that can only lower the role:
  Discord chat, button picks, `/session start` and `/work` stamp the
  speaker's role; schedules (no role passed), WATCH (no actor) and workers
  (`CORVIDINHO_ACTING_*` dropped) are community. Missing stamp ⇒ the ADMIN bit
  alone caps at owner, so every existing caller (and ROLES-CHAT test) behaves
  as before.
- **One rule for runPlugin and the catalog.** `roleAllowsPlugin(role, cmd,
  workTask)`: read tools for all; mutating tools for owner / no role session;
  team only `TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`)
  and, in `/work` (`CORVIDINHO_ACTING_WORK_TASK=1`), `TEAM_WORK_TOOLS`
  (`files-write`, `files-edit`); community none. `runPlugin` keeps the same
  refusal text, so the ROLES-CHAT-3 summary note works for every role.
  `buildOpenAiTools` takes `actingRole` / `workTask` (`actingIsAdmin` kept for
  existing callers); `createTaskExecute` resolves the role per attempt.
- **GitHub (IDENTITY-10).** `checkRepoGateForActingRole(repo, { write })`:
  deny first; team writes need the GITHUB-6 allowlist, team reads pass on it
  or a confirmed-public repo; community writes are refused; owner / CLI keep
  the allowlist. The four GitHub write commands pass `write: true`.
- **/work (IDENTITY-10).** The team member's run gets the work flag, so the
  file tools apply only inside its own worktree (a /work session always has
  one; chat may fall back to the project root, so chat never gets them). The
  handler ships the PR for owner or team, re-resolving the team role from the
  live people list after the run (a demoted member gets no PR); the PR path's
  own gates (allowlist, verify, GITHUB-6) are unchanged.
- **ADMIN-3.b.** `/admin people role` reuses the #36 writer (`op: "role"`,
  plan → SAFE-5 `started` → atomic write → `ok`, re-read safety net, unread
  keys kept).
- **ROLES-CHAT-8.a.** Two read-only readers in `plugins/github/public-docs.ts`
  (docs-only paths, milestones) behind the acting role's repo gate, and the
  public Q&A prompt names exactly those sources. `web-fetch` stays dangerous,
  so it is never a community source; no site URL is configured.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. Team's tool grant is exactly `github-issue-comment` + `github-pr-review`
   (reviews) everywhere on Discord, plus `files-write` / `files-edit` only in
   a `/work` run (work tasks); team gets no shell / runners (SAFE-3.a says
   non-owners never), no git or other GitHub writes, no `discord-post-message`
   / `discord-send-file`, no `web-fetch`, no `delegate` / `council`. The `/work`
   PR itself is opened by the handler for team as for the owner. A team
   `github-pr-review` posts as `COMMENT` only: `APPROVE` counts toward a merge
   and `REQUEST_CHANGES` can block one, so both stay the owner's.
2. Team GitHub writes only on GITHUB-6-allowlisted repos; team reads on
   allowlisted or confirmed-public repos (never less than community).
3. WATCH (GitHub), schedules and `delegate` / `council` workers stay community
   whoever triggered them, even the owner (today's behaviour); a team
   member's own schedules stay read-only (DISCORD-SCHEDULE-1.a covers owner
   schedules separately).
4. "Only their own memory": team keeps the existing per-user memory scope;
   forget / override (even self-forget) stay owner-only as MEMORY-ACL-3/4
   say. Community keeps `memory-store` / `-recall` for itself, as today
   (ROLES-CHAT-2 lists memory recall as a read tool; it is not marked
   mutating).
5. "Briefings" (#102) do not exist yet; nothing is offered for them.
6. "Announcements" for community = receiving what the owner posts; `/announce
   channel` stays owner-only. Community may still run `/session start` and a
   read-only `/work` (no edit tools, no PR), as today.
7. No `role` key ⇒ community; `role = "owner"` outside the owner's person ⇒
   community with a problem line; a bad role value ⇒ the entry is skipped
   whole (the person is then undeclared, still community).
8. `/admin people role` sets team or community only; the owner role is
   changed only through `[owner]` / env on the VM (IDENTITY-1), and the
   owner's own person cannot be given another role there.
9. Team sessions keep community's secret-path refusals (`.env*`, keys) for
   reads, and their `/work` `files-write` / `files-edit` refuse the same
   secret-looking paths (an edit would otherwise tell whether a string is in
   a secret file); SAFE-2 still refuses protected paths. `github-docs-read`
   refuses and hides secret-looking doc paths for every non-owner session
   (ROLES-CHAT-8 "refuse ... secret paths").
10. ROLES-CHAT-8.a "allowed public repos" = public repos that pass the
    community gate (deny lists win, visibility confirmed public), as
    ROLES-CHAT-8 already reads "any public GitHub"; `github-docs-read` is
    docs-only for every role, and community's local project file reads are
    unchanged.
11. Two internal spawn env keys (`CORVIDINHO_ACTING_ROLE`,
    `CORVIDINHO_ACTING_WORK_TASK`) carry the per-surface cap, like
    `CORVIDINHO_ACTING_IS_ADMIN`; they are not operator config and can only
    lower a role.
12. A team `/work` is verified like the owner's (AGENT-4): the verify lane
    runs the project's own checks on the team member's edits in the
    worktree (its env drops tokens, keys and the acting identity), and the
    pushed branch runs the repo's CI. That is code the team member's run
    wrote executing on the box and in CI; SAFE-2 does not protect
    `.github/workflows` or test files. The guard is the owner's consent: the
    repo must be GITHUB-6-allowlisted and `git-push` / `github-pr-create`
    allowlisted for any `/work` PR.
13. ROLES-CHAT-8.a sits under ROLES-CHAT-8 in `hi/roles.md` by hand: `hi`
    rejects a multi-part prefix as a subcommand, and `hi/roles.md` declares
    `families: [ROLES]`, so `hi` does not count the ROLES-CHAT ids at all.

## From the change's testing.md

# Testing

Fixture tests only: temp allowlist files, dry-run GitHub writes, a real
Octokit with a mocked fetch, a scripted LLM provider, fake spawn bins,
`startBridge` with a null gateway and the slash handlers directly; no live
Discord or GitHub, no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-065` | `tests/roles.team.test.ts` ("IDENTITY-8: one role per declared person …") | `role = "team"` / `"community"` (any case, TOML and JSON) resolve; no role and undeclared ⇒ community; the owner ⇒ owner; a list, an unknown or an empty role skips the entry with an issue naming the person, never an id; `role = "owner"` elsewhere ⇒ community with an issue; the owner's person declared community stays owner; no owner ⇒ nobody is owner. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` ("IDENTITY-12: the tool layer resolves the role on every call") | No role session ⇒ null; owner + bridge bit ⇒ owner; team person with a team stamp ⇒ team, with a community stamp or none ⇒ community; owner stamp for a team person ⇒ team; undeclared / community / no-role / empty actor with a team stamp ⇒ community; a file edit, mute, deny-list or unreadable file applies at the next call. `roleAllowsPlugin` checked for every registered plugin and role. |
| `REQ-agent-065` | `tests/roles.team.test.ts` ("IDENTITY-9..11: the catalog by role") | With every dangerous plugin allowlisted: owner and null equal the ADMIN catalog, community equals the non-ADMIN one (no mutating plugin), team adds only the two review tools (and exactly `files-write` / `files-edit` with `workTask`), an unallowlisted review tool is not offered; through `createTaskExecute` and a scripted provider the offered tools follow the role per run (team chat, team /work, team on a community surface, undeclared with a team stamp). |
| `REQ-plugins-065` | `tests/roles.team.test.ts` ("IDENTITY-10/11: runPlugin by role") | Team `github-issue-comment` / `github-pr-review` run (dry-run) on an allowlisted repo, GITHUB-6 refuses another repo, every other mutating plugin gets the role refusal; `files-write` only with the work flag, SAFE-2 still refuses `.env`; community and undeclared refused; a demotion refuses the next call; team memory store/recall in their own scope, forget/override refused; repo gate: team reads allowlisted or public, writes allowlisted only, community writes refused, deny wins. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` ("team reviews post as COMMENT …", "a team /work run never writes or edits a secret-looking path …") | Team `github-pr-review` `COMMENT` runs; `APPROVE` / `approve` / `REQUEST_CHANGES` get the role refusal naming IDENTITY-10; the owner runs all three. In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `deploy.pem`, `.ssh/config`; `files-edit` on `credentials.json` refuses without "no match" and leaves it unchanged; the owner edits it. Both fail on the pre-review branch sources (356ba9b) and pass after. |
| `REQ-plugins-066` | `tests/github.public-docs.test.ts` ("non-owner sessions refuse secret-looking doc paths …") | A community session refuses `docs/.env.example`, `docs/deploy.pem`, `docs/.ssh/config`, `docs/keystore/a.json` (exit 2, no GitHub call) and a `docs/` listing leaves them out; the owner reads and lists them. Fails on the pre-review sources and passes after. |
| `REQ-discord-065` | `tests/roles.team.test.ts` ("IDENTITY-12 on Discord surfaces", "Discord chat stamps …", "/work and /session start by role") | `resolveDiscordActingRole` owner / team / community, muted or deny-listed team ⇒ community; the spawn env stamps role and work flag, overwriting a stale parent value, no role ⇒ community; through `startBridge` chat stamps each speaker's role and a file edit applies to the next message; `/session start` stamps the role without the work flag. |
| `REQ-discord-088` | `tests/roles.team.test.ts` ("/work and /session start by role") | A team member's `/work` runs with team + `workTask: true` and reaches the PR step; the owner's is unchanged; community and undeclared never reach it (the reply names the owner and team); a team member demoted during the run gets no PR. `tests/work.pr.test.ts` (unchanged) still passes. |
| `REQ-discord-065` / `REQ-discord-043` | `tests/roles.team.test.ts` ("ADMIN-3.b …") | `/admin people role` promotes / demotes with `admin-people-role` `started`/`ok` rows by the owner, writes `role = "team"` in the entry and keeps `[owner]` / `[github]`, reports no change for the same role, refuses the owner role, unknown roles, undeclared people, the owner's person and a missing role (`denied` rows, file unchanged), refuses a non-owner (even team, `denied` row) and a missing audit trail; `people list` shows roles; `config show` counts them; JSON keeps unread keys; the tool layer sees the new role at once. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | Body shape: `people` has `list add link unlink remove role`; `role` takes `person` and `role` (choices team / community); nine commands. |
| `REQ-plugins-066` | `tests/github.public-docs.test.ts` | `publicDocPath` accepts README / STATUS / CHANGELOG and `docs/**` and refuses the rest; community reads README / STATUS / a docs file (scrubbed, untrusted), lists `docs/`, truncates past 64 KiB, refuses binary; other paths refused with exit 2 and no GitHub call (CLI too); private / unconfirmed / denied repos refused before any read; milestones mapped with `--state` / `--limit`, bad flags refused; the community catalog has the readers and never `web-fetch`. |
| `REQ-agent-065` | `tests/github.public-docs.test.ts` ("the prompt names the sources …") | The public Q&A prompt names README, docs/, STATUS, CHANGELOG and the public issues and milestones of allowed public repos, says nothing else counts, and drops "the project site, and the roadmap". |

Fail on base: with the stacked base sources swapped in (72fec65 `src/` and
`plugins/`, `plugins/github/public-docs.ts` absent), the two new files fail
to load (`resolveDiscordActingRole` / `public-docs.ts` missing) and the
`/admin` body test fails (3 fail, 29 pass). A behavioural copy that imports
only base exports (team `role` read, a team review comment via `runPlugin`,
a team catalog without `files-delete`, the readers registered, a team `/work`
reaching the PR step, `/admin people role` audited) fails 6 of 6 on base and
passes on the branch. All pass on the branch (70 across the three files and
the copy); every existing ROLES-CHAT test (`tests/roles.chat.gates.test.ts`,
`tests/github.public.community.test.ts`, `tests/search.secret-path.test.ts`,
`tests/work.pr.test.ts`, `tests/memory.plugins.test.ts`) passes unchanged.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync
check --require-coverage 100` 100%; `hi check` green; `fledge lanes run
verify --non-interactive` completed.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
