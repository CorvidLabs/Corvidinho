---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: design
---

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
  is by numeric id.
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
