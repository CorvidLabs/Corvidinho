---
module: discord
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
---

# Delta: discord (the `memory` card kind; the spawn passes no typed token — SAFE-18.a)

## Added

### REQUIREMENT REQ-discord-183

My own memory forget and override by id ask me on a DM card with Approve and
a one-time code, and an override shows the new text word for word
(SAFE-18.a, captured in this change's PR from Leif's 2026-09-28 interview,
round 17, under SAFE-18; SAFE-19 / SAFE-20 binding).

- `src/discord/approval-cards.ts` SHALL export `memoryApprovalKind(opts)`:
  the `memory` kind (`MEMORY_CARD_KIND`, `cvok:memory:…`) over
  `approval_requests` via `storedApprovalKind`, class `destructive`
  (`MEMORY_CARD_CLASS`; Approve also needs the one-time code), audit prefix
  `memory` (`memory-card`, `memory-approve`, `memory-deny`,
  `memory-expire`), nothing-done line "nothing was forgotten or changed",
  outcome "Approved by you — the waiting run makes exactly this change.".
  Approve only records the decision; the waiting memory-plugin run uses it
  once (REQ-plugins-183). A request whose waiting run is gone SHALL close as
  a no on the next pass.
- The bridge SHALL register it with its other kinds, so the engine's 5 s
  poll, the pass after each chat run and the scheduler ticks DM the owner the
  card: the override's new text first, verbatim inside one code block headed
  as quoted data (SAFE-6 scrubbed, fence-safe, never cut — a text that does
  not fit is not sent and lapses as a no), then the card with the exact
  action, target and amount one line each and its buttons. Only the owner's
  press and code count (re-checked on every press and submit).
- `src/memory/card.ts` SHALL export `askMemoryCard`, `memoryCardFields`,
  `setMemoryCardTestHooks` and the `MEMORY_CARD_*` constants (re-exported
  from `src/memory/index.ts`); `src/memory/confirm.ts` and its exports are
  removed.

Acceptance Criteria
- The card goes to the owner by DM with `cvok:memory:approve|deny` buttons, the asking surface in its title, the exact action / target / amount and the one-time-code line.
- An override's text part comes first as quoted data, verbatim, fence-safe and scrubbed.
- Approve + the right code records `approved` and the waiting run uses it once; Deny, a lapse, a late press or a gone waiter is a no.

## Modified

### REQUIREMENT REQ-discord-128

Discord call sites that spawn an agent run on behalf of a human (message
path, `/session start`, `/work`) SHALL pass the human's own words as
`humanText`, separate from the memory/image-enriched prompt. No confirm
token SHALL reach a run from either: since SAFE-18.a the owner's memory
forget and override by id ask on a DM card (REQ-discord-183), and the spawn
always clears `CORVIDINHO_ACTING_CONFIRM_TOKENS` (REQ-discord-021);
scheduler runs pass no `humanText`.

Acceptance Criteria
- A confirm token in the human's message, or only in the enriched prompt (e.g. recalled memory), is not passed to the run.
- Bridge, `/session start` and `/work` pass `humanText`.

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
(MEMORY-ACL-6, REQ-discord-101). The owner's own forget and override by id
ask on the owner's `memory` DM card with the one-time code (SAFE-18.a,
REQ-discord-183 / REQ-plugins-183).

The Discord agent spawn SHALL always overwrite `CORVIDINHO_ACTING_DISCORD_USER_ID`
(empty when the run has no acting user) and `CORVIDINHO_ACTING_IS_ADMIN`, so a
value in the bridge's own environment never leaks into a spawned run. Memory
plugins SHALL read identity only from that env, never from argv
(REQ-plugins-011). The spawn SHALL run non-interactive
(`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1 / CLI-3) and always clear
`CORVIDINHO_ACTING_CONFIRM_TOKENS`, like the WATCH spawn: since SAFE-18.a a
typed confirm token counts for nothing, even when the human's message holds
one. Re-storing an existing memory key SHALL keep the prior content as a
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
- Discord spawn env carries the dispatching actor, or an empty actor, never an inherited one; it is non-interactive and carries no confirm token, even one the human typed (SAFE-18.a).
- Re-storing a key soft-deletes the prior row instead of overwriting it.
- Fixture tests + SpecSync + fledge verify green.
- The profile and private-note categories are accepted; a default recall leaves private notes out.
- A declared person's rows use the `person:<id>` scope and a project's the `project:<key>` scope (REQ-discord-101).
- The owner's forget / override by id asks on the `memory` DM card (REQ-discord-183).
