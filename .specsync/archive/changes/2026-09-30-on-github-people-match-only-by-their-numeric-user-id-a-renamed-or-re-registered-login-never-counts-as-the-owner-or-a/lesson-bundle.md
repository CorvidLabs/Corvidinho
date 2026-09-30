# Lesson bundle — on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36)
- **Kind**: Feature
- **Specs**: discord, watch, cli, plugins, agent
- **Paths**: .env.example, allowlist.example.toml, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, docs/discord.md, plugins/memory/commands.ts, src/cli.ts, src/discord/admin-people.ts, src/discord/command-handlers/admin.ts, src/discord/slash-commands.ts, src/discord/slash-types.ts, src/doctor.ts, src/identity/owner.ts, src/identity/people.ts, src/memory/scope.ts, src/watch/memory-inject.ts, src/watch/router.ts, tests/cli.doctor-truth.test.ts, tests/discord.admin-people.test.ts, tests/identity.owner.test.ts, tests/identity.people.test.ts, tests/identity.recognise.test.ts, tests/memory.rank.test.ts, tests/memory.recall-github.test.ts, tests/safe.injection.test.ts, src/identity/github-user.ts, tests/identity.github-numeric-id.test.ts, tests/watch.github-numeric-id.test.ts
- **Acceptance**: IDENTITY-7.a (captured in this PR from Leif's 2026-09-28 interview, round 12): on GitHub a person, the owner included, matches only by numeric user id; resolvePerson and memorySubjectForGithub never match a GitHub login, so a renamed or re-registered login with another numeric id (or an event with no id) resolves undeclared (community) in the WATCH identity block, the WATCH memory inject and the memory plugins, and is not exempt from the SAFE-13 injection guard, while the declared numeric id matches whatever the login now is; [owner] github_id (TOML or JSON) declares the owner's GitHub id and joins the owner's person, and isOwnerGithub matches that id only; /admin people link github:<login> looks the login's numeric id up once through the GitHub API (owner-only, audited as today) and stores it in github_ids next to the login, a failed or mismatched lookup links nothing and is audited as an error; people entries with only github_logins keep loading and matching on Discord but not on GitHub, and corvidinho doctor prints [warn] people-github naming them by person id only; the live Octokit search client maps user.id to DetectedEvent.senderId; tests/identity.github-numeric-id.test.ts, tests/watch.github-numeric-id.test.ts and the doctor test fail on the base sources and pass after

## Evidence

- Verification commit: `719f95d66002280d0f4f52a6883d6c0fb932dea2`
- Base commit: `61fbe1698da739fe1e05a104ce6411adde224a05`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #36 (CONTACTS, milestone M1 "Knows everyone"). The declared-people
slice (#271) left design choice 7 pending Leif: GitHub logins counted as
stable ids unless a known numeric id differed. Leif decided it in the
2026-09-28 interview record, round 12 (2026-09-29): **numeric id only on
GitHub** — a GitHub person matches only by numeric user id; a login alone never
matches (a renamed or re-registered login can't impersonate); `[owner]` gets a
`github_id` key; `/admin people link github` stores the id once. Captured with
`hi` in this PR's first commit (`61fbe16`, on main `20a0f58`):

- **IDENTITY-7.a** "On GitHub it matches people only by their numeric user id,
  so a renamed or re-registered login never counts as them." (parent
  **IDENTITY-7** "It matches people on stable ids, never on display names."
  was already captured.)

Gap on main: `resolvePerson` (src/identity/people.ts ~681) accepted a login
unless the person declared `github_ids` and the event's id differed; a person
or owner with only a login — the built-in owner always, since `[owner]` had no
id key — matched any account holding that login. That reached every GitHub
recognition path: the WATCH identity block and `role: owner` line, the WATCH
memory inject and memory plugins (MEMORY-8, #292), and the SAFE-13 owner
exemption in `watchInjectionVerdict` (#295). `isOwnerGithub` compared logins.
Roles (`resolveActingRole`, src/plugins/roles.ts) match the Discord id only
and WATCH runs are community, so roles needed no change.

Constraints (settled): reuse the owner / allowlist file and the one resolver;
owner admins; v1 off-chain; no schema bump; no package version bump; #232 /
#233 are landed separately and untouched.

## From the change's design.md

# Design

- **Resolver (IDENTITY-7.a).** `resolvePerson` matches the GitHub side on
  `githubId` only; `PersonQuery.githubLogin` stays in the type, accepted and
  ignored (callers and tests keep compiling; a login can never widen a
  match). `memorySubjectForGithub` resolves on `id` only. No id or an
  undeclared id ⇒ null ⇒ community (IDENTITY-12).
- **Owner.** `[owner] github_id` (TOML quoted / bare, JSON string / safe
  integer) → `OwnerRecord.githubId`; invalid ⇒ ignored with a value-free
  issue. `buildPeopleDirectory` adds it to the owner's person (declared or
  built-in) next to the login. `normalizeGithubId` moves to `owner.ts` and is
  re-exported by `people.ts` (one normalizer). `isOwnerGithub(owner,
  githubId)` compares the numeric id.
- **WATCH.** `formatWatchIdentityBlock` and `watchInjectionVerdict` pass
  `senderId` only; `enrichWatchPromptWithMemories` passes `{ id }`;
  `WATCH_IDENTITY_HEADER` and the `declared_person: none` line say the match
  is by numeric id. With only the owner configured, an unresolved commenter
  whose login is the owner's still gets the `declared_person: none` block, so
  the owner's login never passes for the owner unsaid (review follow-up).
- **Zero is not an id.** `normalizeGithubId` rejects `0` / `000` as a string,
  as it already did as a number (GitHub ids start at 1), so the example's
  `github_id = "0"` placeholder is ignored with an issue instead of read.
- **`/admin people link github:<login>`.** The handler plans the request
  first (a refusal keeps its reason and calls nothing), then defers the
  ephemeral reply, looks the login up once (`createGithubUserLookup`,
  `src/identity/github-user.ts`; `SlashContext.lookupGithubUser` for tests),
  adds the id as a `github_id` link and plans again; commit + SAFE-5 rows
  unchanged. Failure / timeout / 404 / another login ⇒ refused, nothing
  written, one `error` row. `unlink github:` removes the label; the reply
  says any remaining id still matches.
- **Doctor.** `peopleWithoutGithubId(dir)` + `peopleGithubDoctorCheck` →
  `[warn] people-github` naming person ids only; never fails doctor.
- Logins stay labels (display, @mention, forget-me, clash refusal).

## Design choices pending Leif

Each is the most conservative reading of IDENTITY-7.a and round 12; none
adds a criterion.

1. **No env var for the owner's GitHub id.** `[owner] github_id` is read from
   the allowlist file only (as decided: "`[owner]` gets a `github_id` key");
   env still overrides the other owner fields. An owner configured only by
   env is not recognised on GitHub until the file has `github_id` (doctor
   warns). A `CORVIDINHO_OWNER_GITHUB_ID` twin would be a new env surface.
2. **`link github:<login>` stores both** the looked-up id (`github_ids`, what
   matches) and the login (a label for display, @mention and forget-me). It
   also runs for a login that is already linked, which is the migration path
   for login-only entries.
3. **A failed lookup refuses the whole link** (nothing written, audited
   `error`), and a lookup that answers for another login is refused too;
   `github_id:<number>` stays as the manual path. The lookup uses
   `GITHUB_TOKEN` / `GH_TOKEN` when set, else anonymous, with a 10 s timeout.
4. **`unlink github:<login>` never looks anything up** and leaves the
   person's ids linked (a renamed login would resolve to another account);
   the reply says the id still matches.
5. **Login-only entries are not migrated automatically** — they keep loading
   and matching on Discord; doctor names them; `/admin people list` shows
   links as before (no extra marker).
6. **Out of scope, unchanged:** the WATCH user allowlist (`[github] users`)
   and the assignment / review-request actor gate still match logins
   (ALLOW-1/2, a separate criterion); for assignment / review-request events
   the recognised person is still the thread author (`senderId`), as before.

## From the change's testing.md

# Testing

Fixture tests only: temp allowlist files, in-memory SQLite, the slash
dispatcher with an injected GitHub lookup, `startWatchPoller` with the live
Octokit search client over a stubbed `fetch`, the real CLI for doctor with a
clean env; no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-367` | `tests/identity.github-numeric-id.test.ts` | A login alone, or the owner's / a declared person's login with another numeric id, resolves nobody in `resolvePerson` and `memorySubjectForGithub`; the declared id resolves under any login. `[owner] github_id` from TOML (quoted / bare) and JSON (string / number), an invalid one — `0` / `000` included — ignored with a value-free issue (a people entry with `github_ids = ["0"]` is skipped whole); loaded from the file it joins the owner's person; an env-only owner login is not the owner on GitHub. A login-only entry loads with no issue, matches on Discord, not GitHub, and matches once `github_ids` is added. `/admin people link github:` writes the looked-up id to `github_ids` (login kept), `started` / `ok` rows, deferred reply, live at once, a second link no change; a failed / missing / mismatched lookup writes nothing and audits `error`; a refused request and `github_id:` links make no lookup. `createGithubUserLookup` over a stubbed fetch: 200 → id + canonical login with the token as auth; 404 → no user; 500 → status only, token never in the error; no id → refused. |
| `REQ-discord-367` / `REQ-discord-036` / `REQ-discord-042` | `tests/identity.people.test.ts`, `tests/identity.owner.test.ts`, `tests/discord.admin-people.test.ts` | Resolver by Discord id / `<@id>` / numeric id, never a login; the built-in owner by `[owner] github_id` only, the declared owner's person gets the `[owner]` id; `isOwnerGithub` by numeric id only; `/admin people` link / unlink with a fake lookup (unlinking a login says its id still matches); the owner's person matched by its linked id, not the `[owner]` login. |
| `REQ-discord-067` / `REQ-plugins-067` | `tests/memory.rank.test.ts`, `tests/memory.recall-github.test.ts` | `memorySubjectForGithub` by id only; the undeclared-under-`[people]` owner by `[owner] github_id`; through the memory plugins a renamed login with the declared id is the person, the `[owner]` login alone recalls nothing, a login with another id or no id saves nothing. |
| `REQ-watch-367` / `REQ-watch-036` / `REQ-watch-067` / `REQ-watch-071` | `tests/watch.github-numeric-id.test.ts` | Live `createOctokitSearchClient` over a stubbed transport: `user.id` → `senderId` on issue and comment events, none when the payload has no id. On those events: renamed login + declared id → that person; the owner's login with no / another id → `declared_person: none`, no `role: owner`, no owner or person memory, flagged by `watchInjectionVerdict`; the owner's id → owner, exempt; with only the owner configured, the owner's login with no / another id still gets `declared_person: none` and any other undeclared login no block. Through `startWatchPoller` with the live client: an injection from the re-registered owner login is refused before any run (one comment @mentioning the owner); an ordinary one runs undeclared without the owner's memory; the owner's id runs with `role: owner` and the owner's memory. |
| `REQ-watch-036` / `REQ-agent-071` | `tests/identity.recognise.test.ts`, `tests/safe.injection.test.ts` | The identity block by numeric id (a login with no id is `declared_person: none`; the owner by `[owner] github_id`); `startWatchPoller` recognises a person added by `github_ids`; the SAFE-13 verdict exempts the owner's id and flags the owner's login with no or another id. |
| `REQ-cli-367` | `tests/cli.doctor-truth.test.ts` | Real CLI, clean env: `[owner]` login without `github_id` and a login-only person → one `[warn] people-github: ada, the owner: …` line, person ids only (no Discord id, GitHub id or login), doctor passes; with ids everywhere no line. |

Fail on base: with the base sources swapped in (`git checkout origin/main --
src plugins` at 20a0f58, `src/identity/github-user.ts` removed, branch tests
kept, then restored byte-for-byte): `tests/identity.github-numeric-id.test.ts`
fails 8 of 9 and `tests/watch.github-numeric-id.test.ts` 2 of 3 (the live
mapping case and "a refused request makes no lookup" hold on both); across the
eight updated files 15 cases fail (identity.people 3, identity.owner 1,
memory.rank 2, admin-people 3, safe.injection 1, identity.recognise 2,
memory.recall-github 2, doctor 1). All pass on the branch.

Review follow-up (owner-only block for the owner's login; zero is not an id):
with the sources of the PR's first head (37da03c) swapped in, the two touched
cases fail (the owner-only `declared_person: none` assertions in
`tests/watch.github-numeric-id.test.ts`, the `github_id = "0"` assertions in
`tests/identity.github-numeric-id.test.ts`); they pass after.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/cli/context.md`
- `specs/plugins/context.md`
- `specs/agent/context.md`
