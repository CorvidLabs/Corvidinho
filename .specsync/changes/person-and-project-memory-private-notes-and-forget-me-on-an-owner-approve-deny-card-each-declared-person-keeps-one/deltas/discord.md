---
module: discord
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
---

# Delta — discord (profiles and project memory in the inject; forget on request on the owner's DM card)

## Added

### REQUIREMENT REQ-discord-101

Memory scopes, the Discord inject and forget on request (MEMORY-5..7,
MEMORY-ACL-6, #101). A memory row's `owner_user_id` SHALL be its scope
(`src/memory/scope.ts`): the Discord user id for anyone not on the owner's
people list (and for the configured owner until declared under `[people]`),
as before; `person:<id>` for a declared person, matched on the acting
Discord id in the people list re-read now (stable ids only, IDENTITY-7), so
every Discord id linked to them reaches one profile (an id declared for two
people matches nobody and joins neither profile), and reads SHALL also
include rows stored under those Discord ids before they were declared (a key
in two scopes read once, newest first); `project:<key>` for a project,
keyed by the lowercased `owner/repo` of the checkout's `origin` remote
(credentials in the URL never kept), else the real path of the main checkout
(so every talk worktree shares it), else the folder's real path (only the
folder itself is examined for a repository). `MemoryStore.recall` SHALL
leave private notes (`private`) out unless `category` is `private` or
`includePrivate` is set.

The chat and button-pick inject (REQ-discord-023) SHALL recall the speaker's
subject (`memoryInjectOptsFor`: their declared person's scopes, else their
Discord id), never private notes and never anyone else's memory, and for an
owner or team speaker SHALL append a `[Corvidinho project memory …]` block
for the session's project (`sessionCwd` or the project root) when it holds
rows; community speakers never get it. Owner and team `/work` runs SHALL
start with that project block when it holds rows
(`enrichPromptWithProjectMemory`).

Forget on request (MEMORY-ACL-6): an ask recorded by `memory-forget-me`
(REQ-plugins-101) SHALL live in `forget_requests` (schema v12, forward-only
migration: id, subject kind and id, requester Discord id, origin
conversation ids, status `pending|approved|denied|expired`, created /
expires / card / decided / notified times, decider id, deleted-row count —
no free text, so nothing to scrub, SAFE-6; at most one pending ask per
subject). The bridge SHALL run one delivery pass (`createForgetCards`,
`src/discord/forget-card.ts`; never throws, one pass at a time) on every
scheduler tick (`SchedulerServiceOpts.onTick`, called at the start of each
tick, a throw logged) and after each chat message, and expose it as
`deliverForgetCards` on the started bridge. A pass SHALL: close every
pending ask past its expiry (24 h, `FORGET_REQUEST_TTL_MS`) as `expired`
and edit its card to say nothing was forgotten, buttons removed; DM the
configured owner (`GatewayHandlers.sendDm`, no mentions parsed) one
Approve/Deny card per undelivered pending ask, built with the reusable
helper `src/discord/approve-card.ts` (`cvok:<kind>:<approve|deny>:<id>`
custom ids; Approve danger, Deny grey; the text names who asked and where,
what Approve deletes with a stored-row count, what is kept, the request id and
when it lapses — never memory content), recording the card's DM channel and
message ids; and tell each asker whose ask was closed the outcome, by DM,
else in the conversation they asked in while it or its parent channel is
still allowlisted (mentioning only them), giving up after a day.

A press on a card SHALL be handled before the channel allowlist (it is the
owner's DM) and SHALL count only when the presser resolves ADMIN now (the
configured owner, not muted, not deny-listed); anyone else gets an ephemeral
refusal and a `denied` audit row. A closed ask SHALL answer "already
closed"; a press at or after expiry SHALL close it `expired` and delete
nothing (a late answer is no). Deny SHALL close it `denied` (audited),
delete nothing and tell the asker. Approve SHALL append the SAFE-5
`memory-forget-approve` `started` row first and, when it cannot be
written, refuse and leave the ask pending; then, in one IMMEDIATE transaction,
compare-and-set the ask to `approved` and delete for good every memory row
of the recorded subject — `person:<id>` and the Discord ids linked to that
person now plus the asker's id, or the undeclared asker's id; active,
soft-deleted and private rows — and the stored turns of those Discord ids'
sessions; then append `ok` (or `error`, the ask left pending, on a
failure), update the card with the counts and no buttons, and tell the asker.
The people list entry and project memory SHALL NOT be touched. Audit rows hold
the request id digest and outcome only.

Acceptance Criteria
- A declared person's store lands in `person:<id>`, each linked Discord id recalls it, rows under their Discord ids from before still read once; an undeclared user keeps the Discord-id scope.
- The chat inject holds the speaker's own profile only, never private notes; owner / team get the project block (also in `/work`), community never.
- `projectKeyFor` gives `owner/repo` without credentials for a checkout and its worktree, the main checkout path without an origin, the folder path for a plain folder.
- A delivery pass DMs the owner one card per pending ask (count, no content), expires unanswered asks (card closed, asker told) and tells deciders' askers by DM or in their allowlisted conversation.
- Only the owner's press counts; Approve deletes every memory row and session turn of that person (not others', not project memory, not the people list), writes `started` then `ok`, updates the card and tells the asker; a keyed chain with no key refuses Approve and deletes nothing.
- Deny and a late press delete nothing and tell the asker; a second press finds the ask closed.
- A v11 DB migrates to v12 keeping its data; `forget_requests` has no free-text column and one pending ask per subject; re-running is a no-op.
- `tests/discord.forget-card.test.ts` and `tests/memory.profiles.test.ts` cover each and fail on the stacked base sources.

## Modified

### REQUIREMENT REQ-discord-021

Corvidinho SHALL persist conversations, entities, people, and personality notes
in the shared local SQLite database under `~/.local/share/corvidinho/` (schema
version **3**, table `memories`) so they survive process restart (MEMORY-1..4).
Memory SHALL stay local SQLite only — no on-chain, Trust, or Augur path
(MEMORY-3 / MEMORY-ACL-5).

Each memory row SHALL be scoped to `owner_user_id` (acting Discord user id;
since #101 a declared person's `person:<id>` profile scope or a project's
`project:<key>` scope, REQ-discord-101).
Reads and writes SHALL default to that user’s scope only (MEMORY-ACL-1).

Forget, delete, overwrite, and re-attribute operations SHALL require ADMIN
permission re-checked at handler time (MEMORY-ACL-3/4, ADMIN-4, DISCORD-7),
including **self-forget** of one’s own memories. Empty admin/owner lists SHALL
deny-all for forget/override. A non-admin attempt against another user’s
memories SHALL be refused without leaking the other user’s content
(MEMORY-ACL-2). Soft-delete MAY retain audit fields (`deleted_at`,
`deleted_by_user_id`). The one other forget path is a person's own forget
request, carried out only once the owner approves it on a card
(MEMORY-ACL-6, REQ-discord-101).

The Discord agent spawn SHALL always overwrite `CORVIDINHO_ACTING_DISCORD_USER_ID`
(empty when the run has no acting user) and `CORVIDINHO_ACTING_IS_ADMIN`, so a
value in the bridge's own environment never leaks into a spawned run. Memory
plugins SHALL read identity only from that env, never from argv
(REQ-plugins-011). The spawn SHALL run non-interactive
(`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1 / CLI-3) and pass only the confirm
tokens found in the human's message as `CORVIDINHO_ACTING_CONFIRM_TOKENS`
(SAFE-4). Re-storing an existing memory key SHALL keep the prior content as a
soft-deleted row (retrievable by ADMIN) rather than overwrite it, so an update
is never a non-admin forget path (MEMORY-ACL-4).

No Discord slash `/memory` SHALL be invented in this requirement — exposure is
via `MemoryStore` + memory plugins used by the agent/session path. Categories
SHALL be `conversation` | `entity` | `person` | `personality`, plus the
profile categories `project` | `preference` | `decision` | `ask` |
`approval` (MEMORY-5) and private notes `private` (MEMORY-7). Fixture tests
without live Discord SHALL cover CRUD, reload, ACL deny, and admin forget.

Acceptance Criteria
- Schema migrates to v3 with `memories` table and owner/category indexes.
- Store + recall scoped to acting owner; four HI categories accepted.
- Reload after reopen DB returns prior rows (MEMORY-4).
- Non-admin cannot forget/override own or others; empty admin deny-all.
- Admin forget soft-deletes with audit fields; refuse path leaks no content.
- No on-chain memory; no new slash command; no ProcessManager.
- Bridge opens MemoryStore on shared DB; package version bumped for ship.
- Discord spawn env carries the dispatching actor, or an empty actor, never an inherited one; it is non-interactive and carries only human-typed confirm tokens.
- Re-storing a key soft-deletes the prior row instead of overwriting it.
- Fixture tests + SpecSync + fledge verify green.
- The profile and private-note categories are accepted; a default recall leaves private notes out.
- A declared person's rows use the `person:<id>` scope and a project's the `project:<key>` scope (REQ-discord-101).
