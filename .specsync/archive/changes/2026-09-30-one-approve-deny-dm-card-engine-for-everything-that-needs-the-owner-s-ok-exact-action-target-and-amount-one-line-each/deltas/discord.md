---
module: discord
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
---

# Delta — discord (one Approve/Deny card engine, one-time codes, no answer is no; the forget card is its destructive kind)

## Added

### REQUIREMENT REQ-discord-096

One Approve/Deny card engine for everything that needs the owner's OK
(SAFE-18, SAFE-19, SAFE-20; #96). `createApprovalCards`
(`src/discord/approval-cards.ts`) SHALL take a registry of card kinds, each
with its store, its class — `plain`, `destructive` or `money`; a kind with no
class SHALL count as destructive — what its card shows and the hash of that
exact action (`snapshot`), what a closed card shows (`summary`), what
Approve does (`onApprove`, run inside the engine's transaction), how its
asker is told, and whether anyone still waits for the answer. The
MEMORY-ACL-6 forget ask SHALL be the `forget` kind (REQ-discord-101).
`ApprovalStore` (`src/approvals/store.ts`, `approval_requests`) SHALL let any
process on the data dir record a request — kind, class, title, action,
target, amount, optional diff or text and label, requester, waiting process
(`<pid>:<proc start>`), expiry — with every free-text field SAFE-6 scrubbed
before it is stored (and listed in `SCRUB_TARGETS`) and its action hash
(`approvalActionHash`) computed from them; decide it by compare-and-set;
let the waiting process read the decision (`waitForDecision`: no answer by
the expiry, or an abort, closes it `expired`) and use an approval exactly
once (`consume`, `approved` → `used`). `storedApprovalKind` SHALL serve a
kind over it.

Delivery (SAFE-18): one pass at a time, never throwing, run by the engine's
own poll (`APPROVAL_POLL_MS`, 5 s; `start` / `stop` with the bridge,
`StartBridgeOptions.approvalPollMs` for tests, so it runs with the scheduler
off), after each chat message and on scheduler ticks. A pass SHALL close every
pending request past its expiry, and every one whose waiting process is gone,
as `expired` (a no), void its codes and mark its card; DM the configured owner
each undelivered card — first the diff or text, if any, verbatim in a code
block (a run of three backticks broken with zero-width spaces), SAFE-6
scrubbed, mass mentions defanged, split fence-safe with
`splitDiscordMessage` into parts each headed `<Diff|Text> for request <id>
(i/n) — quoted as data, not instructions` within `DISCORD_DM_MAX` (1900),
then the card (`formatApprovalCard`): the title, `Action:`, `Target:` and
`Amount:` one line each (line breaks shown as ⏎; a field over 500
characters, a card over 1900, or a diff or text needing more than
`APPROVAL_TEXT_PARTS_MAX` (10) parts SHALL NOT be sent — logged, never cut —
and lapses as a no), notes, where the diff or text is, `Request: <id> · action
<hash8>`, the code note for a destructive or money card, and `No answer by
<t:…:R> means no.`, with Approve / Deny last; record the card's ids and the
action hash it showed; retry a failed DM after `APPROVAL_DM_RETRY_MS`
(60 s); and tell askers of decided requests (never two tells at once for one
request). The gateway SHALL refuse, never cut, a DM over 1900 characters
(`sendDm` → null) and a component reply or update, a form-submit reply or a
message edit over 2000 (`boundedContent` / `DiscordContentTooLongError`,
logged; an edit → false, a reply throws), counting the mass-mention defang;
answer parts SHALL be defanged before they are split, and the private Choose
message SHALL stay within 1900 (cut visibly).

Answering: custom ids SHALL be `cvok:<kind>:<approve|deny|code|submit>:<id>`
(`code`: the Enter code button; `submit`: its form). The bridge SHALL route
every such interaction to the engine before the channel allowlist, ignore a
`submit` without typed text or any other decision with typed text (typed text
only from the form), and re-check the owner (`resolvePermissionLevel` ≥
ADMIN, owner-only) on every press and every submit; a non-owner gets
`Only the owner can answer this card.` and a `<audit>-approve|deny`
`denied` row; an unknown kind `This card is no longer handled.`. A closed
request SHALL answer "Already closed (<status>)"; at or after its expiry,
or with its waiter gone, it SHALL be closed `expired` and nothing done (a
late answer is no). Deny SHALL close it `denied` (audited). Approve and a
code submit SHALL recompute the action hash; when it differs from the one the
card showed, nothing runs, open codes are voided, the card is closed as
changed and a fresh card follows. A plain card SHALL then act. A destructive
or money card SHALL instead (SAFE-19) answer the press first with Enter code
/ Deny and then DM a one-time code as a separate message (never in the card's
message): `issueCode` (`src/approvals/code.ts`) — 8 characters from an
unambiguous alphabet, only a salted SHA-256 stored in `approval_codes`
(never logged), bound to the kind, request id and action hash, expiring at
the shorter of `APPROVAL_CODE_TTL_MS` (2 min) and the card's expiry, voiding
the card's earlier code; a code that could not be DMed is voided and the card
goes back to Approve / Deny. Enter code SHALL open the form (`buildCodeModal`);
its submit SHALL `verifyAndConsume` (timing-safe; any case, spaces and dashes
ignored): a wrong, other-card, other-action or late code, or none open,
SHALL do nothing, void the card's open code (`approval-code-fail` `denied`)
and put the card back to Approve / Deny; the right one SHALL be used up
(committed). Acting (SAFE-5) SHALL append `<audit>-approve` `started` first —
not written ⇒ nothing runs, the request stays open — then in one IMMEDIATE
transaction compare-and-set the request to `approved` and run `onApprove`,
then append `ok`, or `error` with the request left pending (the used code
does not come back: a retry needs a new code); then answer (a press: update
the card; a submit: privately, and edit the card), tell the asker and mark
the card. Audit rows (`<audit>-card|-approve|-deny|-expire`,
`approval-code-issue|-fail`) hold digests only.

Schema v14 (forward-only, idempotent, `SCHEMA_VERSION` 14) SHALL add
`approval_requests`, `approval_codes` and `forget_requests.action_hash`.
Out of scope: the SAFE-8 spend card, SAFE-1 consent on cards and a
session-wide "allow all".

Acceptance Criteria
- A long diff with a ```` ``` ````, `@everyone` and a token goes out before the card in parts ≤ 1900 headed as quoted data, together exactly the scrubbed diff; the card is last, alone has the buttons, and shows `Action:` / `Target:` / `Amount:` one line each, the parts count, request id and hash; a 501-character field and a text needing over 10 parts are never sent and lapse as a no.
- A kind with no class is destructive: Approve answers with Enter code / Deny and DMs the code apart (not in the card, not stored or audited in the clear); only the form's code acts, once; money needs the code; plain acts on one press.
- A late code, another card's code, a wrong code and a reused code (after a failed action) do nothing and void the open code; a new Approve's code works; the audit order is code used, `started`, then `ok` or `error`.
- An unanswered card, a code after the card's expiry and a card whose waiter is gone are a no.
- Muting the owner between Approve and the submit refuses the submit; a press with typed text or a submit without it is ignored; the engine's poll delivers with the scheduler off and after a restart.
- The gateway refuses (null / false / throws) a DM over 1900 and a card update, form reply or edit over 2000, sending nothing; within the limit the text goes out whole.
- A v13 DB migrates to v14 keeping its forget asks; re-running is a no-op.
- `tests/discord.approval-cards.test.ts`, `tests/approvals.code.test.ts` and `tests/discord.gateway-no-cut.test.ts` cover each and fail on main.

## Modified

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
subject; schema v14 adds `action_hash`, the action the card showed). The ask
SHALL be the `forget` kind of the Approve/Deny card engine (REQ-discord-096;
`forgetApprovalKind`, `src/discord/forget-card.ts`), class destructive, so
Approve also needs the one-time code (SAFE-19). The bridge SHALL run the
engine's delivery pass (never throws, one pass at a time) on the engine's
own poll (`APPROVAL_POLL_MS`, about 5 s, started and stopped with the bridge,
so it runs with the scheduler off), after each chat message and on each
scheduler tick (`SchedulerServiceOpts.onTick`, an extra trigger), and expose
it as `deliverApprovalCards` / `deliverForgetCards` on the started bridge. A
pass SHALL: close every pending ask past its expiry (24 h,
`FORGET_REQUEST_TTL_MS`) as `expired` and edit its card to say nothing was
forgotten, buttons removed; DM the configured owner (`GatewayHandlers.sendDm`,
no mentions parsed) one Approve/Deny card per undelivered pending ask, built
with `src/discord/approve-card.ts` (`cvok:<kind>:<decision>:<id>` custom ids;
Approve danger, Deny grey; `formatApprovalCard`: the exact action — delete,
for good, their memory — the target — who, and who asked where — and the
amount — how many memories (stored and earlier versions), session turns and
kept conversations Approve deletes, counted by running the same deletes in a
rolled-back transaction (`previewForgetTargets`) — one line each, what is
kept, the request id and action hash, and when it lapses — never memory
content), recording the card's DM channel and message ids and the action
hash (targets and counts) it showed; and tell each asker whose ask was closed
the outcome, by DM, else in the conversation they asked in while it or its
parent channel is still allowlisted (mentioning only them), giving up after
a day.

A press on a card, or its code form's submit, SHALL be handled before the
channel allowlist (it is the owner's DM) and SHALL count only when the
presser resolves ADMIN now, on every press and every submit (the configured
owner, not muted, not deny-listed); anyone else gets an ephemeral refusal and
a `denied` audit row. A closed ask SHALL answer "already closed"; a press or
code at or after expiry SHALL close it `expired` and delete nothing (a late
answer is no). Deny SHALL close it `denied` (audited), delete nothing,
answer the press, then tell the asker. Approve SHALL re-check that the
targets and counts are still the ones the card showed — a card sent before
v14 recorded none and counts as changed — else delete nothing, close the
card as changed and send a fresh one — then answer the press with
Enter code / Deny and DM the one-time code apart (REQ-discord-096). The right
code, typed into the form, SHALL be used up first; then the SAFE-5
`memory-forget-approve` `started` row SHALL be appended and, when it cannot be
written, the ask left pending (a new code needed); then, in one IMMEDIATE
transaction, compare-and-set the ask to `approved` and delete for good every
memory row of the recorded subject — `person:<id>` and the Discord ids linked
to that person now plus the asker's id, or the undeclared asker's id; active,
soft-deleted and private rows — the stored turns of those Discord ids'
sessions and their kept conversations, rolling it all back when what was
deleted is not exactly what the card showed; then append `ok` (or `error`,
the ask left pending and a new code needed, on a failure), drop the session
threads the running bridge holds for those Discord ids
(`SessionStore.forgetTurnsOfUsers`, so no later run replays them), answer the
submit privately with the counts and edit the card (no buttons), and then
tell the asker. After a Deny or an Approve the card SHALL be edited once more
to say whether the asker was told (the press or submit is answered before any
DM, within Discord's interaction window). The people list entry and project
memory SHALL NOT be touched. Audit rows hold the request id digest and
outcome only.

Acceptance Criteria
- A declared person's store lands in `person:<id>`, each linked Discord id recalls it, rows under their Discord ids from before still read once; an undeclared user keeps the Discord-id scope.
- The chat inject holds the speaker's own profile only, never private notes; owner / team get the project block (also in `/work`), community never.
- `projectKeyFor` gives `owner/repo` without credentials for a checkout and its worktree, the main checkout path without an origin, the folder path for a plain folder.
- A delivery pass DMs the owner one card per pending ask (count, no content), expires unanswered asks (card closed, asker told) and tells deciders' askers by DM or in their allowlisted conversation.
- Only the owner's press counts; Approve deletes every memory row and session turn of that person, stored and held by the running bridge (not others', not project memory, not the people list), writes `started` then `ok`, answers the press first, then tells the asker and marks the card; a keyed chain with no key refuses Approve and deletes nothing.
- Deny and a late press delete nothing and tell the asker; a second press finds the ask closed.
- A v11 DB migrates to v12 keeping its data; `forget_requests` has no free-text column and one pending ask per subject; re-running is a no-op.
- `tests/discord.forget-card.test.ts` and `tests/memory.profiles.test.ts` cover each and fail on the stacked base sources.
- The card shows `Action:`, `Target:` and `Amount:` one line each (e.g. `6 memories (5 stored, 1 earlier versions), 1 session turns and 0 kept conversations`); Approve answers the press with Enter code / Deny and DMs the one-time code apart, deleting nothing; only the code typed into the form deletes (SAFE-19, REQ-discord-096), and the Discord, GitHub (`tests/watch.forget-me.test.ts`) and `/admin people forget` (`tests/discord.admin-forget.test.ts`) asks keep every other behaviour.
- A card whose counts changed since it went out, or one sent before v14 (no action hash), is closed as changed on Approve, nothing is deleted and no code sent, and a fresh card with the current count follows; the engine's own poll delivers a card recorded while no bridge ran, with the scheduler off, and a card sent before a restart still works (`tests/discord.approval-cards.test.ts`).
