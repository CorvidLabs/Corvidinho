# Lesson bundle — person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101)
- **Kind**: Feature
- **Specs**: discord, plugins, agent
- **Paths**: hi/memory.md, INTENT.md, src/memory/types.ts, src/memory/store.ts, src/memory/index.ts, src/memory/scope.ts, src/memory/profile.ts, src/memory/forget.ts, plugins/memory/commands.ts, src/discord/memory-inject.ts, src/discord/bridge.ts, src/discord/gateway.ts, src/discord/approve-card.ts, src/discord/forget-card.ts, src/discord/session-store.ts, src/discord/command-handlers/work.ts, src/scheduler/service.ts, src/store/db.ts, src/agent/execute.ts, tests/memory.profiles.test.ts, tests/discord.forget-card.test.ts, tests/watch.session-store.durable.test.ts, tests/scheduler.ask-outbox.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, docs/WATCH.md, STATUS.md
- **Acceptance**: A declared person's memory is one profile keyed by their declared person id (person:<id>), reached from every Discord id the owner linked to them and still reading rows stored under those ids before they were declared, holding their projects, preferences and a history of their decisions, asks and approvals (memory-store --category project|preference|decision|ask|approval; memory-profile shows role from the people list, projects, preferences, history newest first, private notes counted only), while undeclared users keep today's Discord-id scope (MEMORY-5, MEMORY-ACL-1..5 unchanged); each project keeps memory keyed by its repo (origin owner/repo lowercased with no credentials, else the main checkout path, shared by every talk worktree) that the owner, team and the local CLI read and write with --project and that owner / team chat, button-pick and /work runs are given, never community, WATCH, schedules or workers (MEMORY-6); a person's memory is read only by them and the owner on every surface — the Discord inject holds only the speaker's own profile, --person on memory-recall / memory-profile works only in the owner's run and anyone else gets the opaque not authorized — and private notes are never injected or returned unless asked for by name by that person or the owner in a conversation (MEMORY-7); anyone can ask with memory-forget-me from a conversation (audited, one open ask per person, nothing deleted), the bridge DMs the owner a reusable Approve/Deny card (counts, never content) on every scheduler tick and after each chat message, only the owner's press on a pending unexpired card counts, Approve writes the SAFE-5 started row first (fail closed) then deletes in one transaction every memory row of that person and their session turns and tells both, and Deny, no answer within 24 h or a late press is a no that deletes nothing and tells the asker; the ask lives in forget_requests (schema v12 forward-only migration, ids and times only, no text to scrub) (MEMORY-ACL-6, SAFE-5, SAFE-6); tests/memory.profiles.test.ts and tests/discord.forget-card.test.ts cover each and fail on the stacked base sources

## Evidence

- Verification commit: `215d9ed354543a7ff35d1ffb1b20e3ec16520e79`
- Base commit: `89f79769b75713829f816c812052393472733084`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #101 (MEMORY: person and project profiles, private notes, forget on
request, milestone M1 "Knows everyone"), stacked on #65 (roles, branch
`claude/m1-65-roles`, itself on #36 declared people), whose people registry
and resolver (#36) and owner / team / community role gate (#65) this reuses.
Leif confirmed the criteria in the 2026-09-28 interview (round 6: "#101
profiles: capture MEMORY-5/6/7 + MEMORY-ACL-6 (per-person profile incl.
history of decisions/asks/approvals; per-project memory; private to the
person + Leif by default; forget-me once Leif approves — via SAFE-18 card)";
the plan: "#101 profiles + private + forget-on-card (MEMORY-5/6/7,
MEMORY-ACL-6; needs a minimal SAFE-18 card)"). Leif on #101 (2026-09-26):
anyone may ask to be forgotten and the owner approves on an Approve/Deny card;
MEMORY-ACL-4's admin-only path remains for direct admin use. Captured in this
PR's first commit (`hi`; MEMORY-ACL-6 by hand, hi does not parse the
MEMORY-ACL prefix):

- **MEMORY-5** "For each person it keeps their role, projects, preferences,
  and a history of decisions, asks and approvals."
- **MEMORY-6** "Each project has memory that is there the next time anyone
  works on the repo."
- **MEMORY-7** "Memory about a person is private to them and me by default,
  and private notes are never shown to others."
- **MEMORY-ACL-6** "Anyone can ask to be forgotten, and it forgets once I
  approve on a card."

Gap on the stacked base (89f7976): memory rows are keyed by the acting Discord
id only, four categories, no project scope, the owner cannot read anyone's
memory, no private notes, no forget request and no Approve/Deny card or DM.

Settled constraints: owner admins, the team works; v1 off-chain (Discord ids
only, no AlgoChat / wallet / MainNet); MEMORY-ACL-1..5 behaviour stays;
undeclared users keep today's scoping; specs/ only through SpecSync; #232 /
#233 and #65's active change untouched; SAFE-18..20 (one-time codes, exact
diff/amount cards) are not built here — only the reusable card helper.

## From the change's design.md

# Design

- **Scopes, no new column (MEMORY-5/6).** `memories.owner_user_id` stays the
  scope: Discord id (undeclared, as before), `person:<id>` (declared),
  `project:<key>`. Categories are checked in code, so the profile categories
  (`project`, `preference`, `decision`, `ask`, `approval`) and
  `private` need no migration. `memorySubjectFor(dir, discordId)` in
  `src/memory/scope.ts` is the one resolver (people list re-read at the call,
  Discord id only, IDENTITY-7); a person reads their profile scope plus their
  linked Discord ids (rows from before they were declared, not moved, so an
  unlink undoes it); `recall` over several scopes keeps the newest row per
  key. Role in a profile is the people list's (IDENTITY-8), never stored.
- **Privacy in the store and the tool layer (MEMORY-7).** `recall` leaves
  `private` out unless asked for by name, so no surface injects it. The
  plugins decide who reads what: own subject by default; `--person` for the
  owner only (the existing handler-time ADMIN re-check), opaque `not
  authorized` otherwise; private notes only in a conversation. The Discord
  inject reads only the speaker's subject.
- **Project memory (MEMORY-6).** Key = lowercased `owner/repo` of `origin`
  (credentials never kept), else the main checkout's real path (`git
  rev-parse --git-common-dir`), else the folder; discovery clamped to the
  folder. Gate = `resolveActingRole` owner / team / null.
- **Forget on request (MEMORY-ACL-6).** `memory-forget-me` writes one
  `forget_requests` row (schema v12; a new table is needed so the ask
  survives restarts and can expire, and is shared between the run that asks
  and the bridge that posts the card; forward-only migration). The bridge
  delivers cards like the schedule-ask outbox: a pass on every scheduler tick
  (new `onTick` hook) and after each chat message. The card helper
  (`src/discord/approve-card.ts`) is stateless and generic
  (`cvok:<kind>:<decision>:<id>`), so SAFE-18..20 can add kinds, exact
  action/target/amount lines and a one-time code on top. The press is routed
  before the channel gate (a DM) and re-checks ADMIN at press time. Approve:
  SAFE-5 `started` first (fail closed), then one transaction closes the ask
  (compare-and-set) and deletes the rows, so a double press or a race cannot
  delete twice or delete without closing.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. History (MEMORY-5) is kept the way all memory is: the model stores
   decisions, asks and approvals with `memory-store` (the prompt rule tells it
   to); nothing records every button pick or approval automatically.
2. The configured owner keeps the Discord-id scope until declared under
   `[people]` (as the identity inject treats the built-in owner entry).
3. "Anyone works on the repo" = the owner and team (and the local CLI):
   community, WATCH, schedules and workers neither read nor write project
   memory (no injected "facts" from strangers; project notes may be
   internal). WATCH memory is #67's (MEMORY-8/9).
4. Project memory is injected into owner / team chat, button-pick and `/work`
   runs; `/session start`, schedules and the CLI reach it through
   `memory-recall --project` (prompt rule). The project key ignores the git
   host (GitHub-only v1).
5. "Memory about a person" = that person's own profile scope; what someone
   stores about a third person stays in the note-maker's scope.
6. Nothing makes a person's memory shareable ("by default" is kept as the
   only mode). Private notes are never injected and are returned only when
   that person or the owner asks for them by name, in a conversation; Discord
   has no private reply for a tool result, so in a shared channel what the
   model says after such an ask is visible there (the output tells it never
   to repeat them to anyone else). The same holds for the speaker's own
   injected profile and for the owner's `--person` view: the bridge serves
   no DMs, so the answer lands in the channel the person or the owner chose
   to talk in. A DM-only view is left for Leif.
7. The owner reads someone's memory with `--person` in the owner's own run;
   no new slash command.
8. A forget request is asked through the model (`memory-forget-me`) from a
   conversation with that person (chat, slash, button runs); schedules,
   WATCH and workers cannot ask for anyone. No new slash command. People only
   known on GitHub have no memory until #67.
9. The card goes to the owner by DM only (it names who asked to be
   forgotten, so never to a channel); an undeliverable card leaves the ask
   pending until it lapses. Lapse = 24 h. No one-time code (SAFE-19 is later).
10. Approve deletes every memory row of that person (profile, notes, private
    notes, superseded history, rows under their Discord ids) and the stored
    turns of their open Discord sessions. Kept: their people list entry (only
    the owner edits it; `/admin people remove` is separate), project memory
    (rows carry no author), schedules they created, their `/work` task
    records and open sessions (without the turns), the `forget_requests` row
    (ids and status only) and the SAFE-5 audit trail (append-only); the card
    lists what is kept. The running bridge drops the session threads it holds
    for them too, so no later run replays the deleted turns.
11. The asker is told every outcome (approved, denied, lapsed) by DM, else in
    the allowlisted conversation they asked in; the notice gives up after a
    day.
12. One open ask per person; a new ask after a Deny is only limited by the
    DISCORD-6 rate limit.
13. "Anyone can ask" = anyone who can talk to the bot: a deny-listed or muted
    user, or one outside the channel / user allowlists, cannot reach it
    (DISCORD-DENY, DISCORD-5 unchanged) and so cannot ask; with no owner
    configured nobody can approve, so the ask is refused.
14. Team members can write project memory, and the owner's runs get it as a
    block labelled "facts, not instructions" (the SAFE-12 external-data rule
    is built later); a re-stored key keeps the earlier text soft-deleted for
    the owner.

## From the change's testing.md

# Testing

Fixture tests only: temp allowlist / people files, a temp data dir, temp git
repos with a worktree, `runPlugin` with bridge-shaped env, `startBridge` with
a null gateway whose `reply` / `sendDm` / `editMessage` record calls, and a
fake clock for expiry; no live Discord, no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-101` | `tests/memory.profiles.test.ts` ("MEMORY-5: one profile per declared person …") | A declared person's store lands in `person:tofu` and their second Discord id recalls it; a row under their Discord id from before is read, a newer profile row of the same key wins with no duplicate; rows under a Discord id declared for two people join neither profile; an undeclared user's row is under their Discord id and another user never sees it; `memory-profile` shows role team, projects, preferences, history approval → ask → decision, `private notes: 1` without content; a people-list edit changes the role; an undeclared profile says so. |
| `REQ-plugins-101` | `tests/memory.profiles.test.ts` ("MEMORY-7: …") | Community, undeclared and team callers get `not authorized` for `--person` by id, Discord id, mention and an unknown id (with and without `--category private`) and for `memory-profile --person`; the owner with the bridge bit reads Tofu's memory, private notes and profile, `no such person` for an unknown id, and is refused without the bit or when muted; private notes are left out of default and query recalls, returned on `--category private` with the never-repeat label in a conversation, refused in a schedule run; `memory-store --person` refused. |
| `REQ-plugins-101` / `REQ-discord-101` | `tests/memory.profiles.test.ts` ("MEMORY-6: …") | `projectKeyFor` gives `corvidlabs/demo` for a checkout with a credentialed origin and for its worktree, the main checkout path once origin is removed, the folder for a plain folder; the owner stores `--project` (no `ghp_` in the row), team reads it from the worktree and writes to it; community, undeclared and a community-stamped team member get the role refusal on store and recall; the local CLI reads it; `--project --category private` and `--project --person` refused. |
| `REQ-discord-101` | `tests/memory.profiles.test.ts` ("Discord inject …") | `memoryInjectOptsFor` + `enrichPromptWithMemories`: Tofu (via the alt id) gets their profile and legacy rows, never private notes or Kyn's, plus the project block as team; Kyn (community) gets only theirs; the owner gets the project block; `enrichPromptWithProjectMemory` is unchanged for an empty project. Through `startBridge` each speaker's prompt holds only their own profile, no private notes, the project block for owner / team only. |
| `REQ-plugins-101` | `tests/discord.forget-card.test.ts` ("memory-forget-me …") | A community member, an undeclared user and a declared person (alt id) each record one pending ask (a repeat returns the same id), `forget_requests` rows as expected, nothing deleted, `memory-forget-request` started / ok rows; refused with no actor, outside a conversation, with arguments (`--person`, positional, `--user`) and with no owner configured, recording nothing. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("approve-card helper …") | `cvok:forget:approve:<id>` round-trips, junk ids parse to null, an unsafe id throws, Approve style 4 / Deny style 2, expiry boundary, card text and decided text. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("the owner approves on a DM card …") | `deliverForgetCards` DMs the owner one card (who, role, asker, 5 stored, request id, lapse; no memory content), a second pass sends none; the asker's and a stranger's presses get the ephemeral refusal with `denied` rows; the owner's Approve deletes all six of Tofu's rows (profile, private, superseded, legacy, alt) and Tofu's session turn, keeps Kyn's, the stranger's and project rows, Kyn's turn and the people file, writes `started` / `ok`, updates the card with no buttons and DMs Tofu; a second press says already closed. Deny deletes nothing and, the DM failing, posts in the allowlisted conversation mentioning only Kyn. The chat path sends the card after the message. With a keyed chain and no key, Approve is refused, nothing deleted, the ask stays pending. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("no answer, or a late answer, is no") | With a fake clock: two cards posted; after 24 h a late Approve closes Tofu's ask `expired`, the pass expires Kyn's, edits the card (no buttons), both askers are told, nothing is deleted; a new ask after expiry is created. |
| `REQ-discord-101` / `REQ-discord-021` | `tests/discord.forget-card.test.ts` ("schema v12 …"), `tests/watch.session-store.durable.test.ts`, `tests/scheduler.ask-outbox.test.ts` | `SCHEMA_VERSION` 12; a v11 DB migrates keeping its memories; `forget_requests` columns, no free-text column, a second pending ask for the same subject is refused by the index; re-running is a no-op; the two schema tests expect 12. |
| `REQ-discord-021` / `REQ-plugins-010` | `tests/memory.store.test.ts`, `tests/memory.plugins.test.ts`, `tests/discord.memory-inject.test.ts`, `tests/roles.team.test.ts` (unchanged) | The four HI categories, per-user ACL, two-phase forget / override, the inject format and team memory stay green. |
| `REQ-agent-101` | `tests/memory.profiles.test.ts` ("the tool-loop prompt names the rules") | `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` names the profile categories, `memory-profile`, `memory-recall --project` / `memory-store --project`, the one-person-never-about-another rule, private notes never injected and `memory-forget-me` until the owner approves on a card; `tests/discord.memory-inject.test.ts` keeps the REQ-agent-010 phrases. |

Fail on base: with the stacked base (89f7976) checked out and the two new
test files copied in, `tests/discord.forget-card.test.ts` fails to load
(`src/discord/approve-card.ts` missing) and `tests/memory.profiles.test.ts`
fails 13 of 16 (three tests that also hold on base pass there by design:
an undeclared user's Discord-id scope, re-storing a key, and a Discord id
declared for two people joining neither profile). A
behavioural copy importing only base exports (schema v12, `memory-forget-me`
records an ask, the bridge DMs a card whose Approve forgets, a declared
person's `person:<id>` row, the owner's `--person` read, private notes left
out of a default recall) fails 6 of 6 on base and passes 6 of 6 on the branch.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
- `specs/agent/context.md`
