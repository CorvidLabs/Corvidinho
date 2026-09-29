---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: design
---

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
