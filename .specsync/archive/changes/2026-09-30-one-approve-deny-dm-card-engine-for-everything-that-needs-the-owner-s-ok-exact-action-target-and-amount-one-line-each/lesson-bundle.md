# Lesson bundle — one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: One Approve/Deny DM card engine for everything that needs the owner's OK: exact action, target and amount one line each with a diff or text sent first as verbatim quoted-data parts and buttons last, never cut; destructive and money cards also need a one-time code DMed apart and typed into a form, valid once, only for that card and action, for 2 minutes; no answer, a late answer or a gone waiter is a no; the engine's own poll delivers with the scheduler off; the forget card becomes its destructive 'forget' kind; schema v14 approval_requests / approval_codes (SAFE-18/19/20, #96)
- **Kind**: Feature
- **Specs**: discord, watch
- **Paths**: src/discord/approval-cards.ts, src/approvals/store.ts, src/approvals/code.ts, src/discord/approve-card.ts, src/discord/forget-card.ts, src/discord/bridge.ts, src/discord/gateway.ts, src/discord/rich-reply.ts, src/discord/private-reply.ts, src/discord/ask-buttons.ts, src/memory/forget.ts, src/memory/index.ts, src/store/db.ts, src/store/scrub.ts, tests/discord.approval-cards.test.ts, tests/approvals.code.test.ts, tests/discord.gateway-no-cut.test.ts, tests/fixtures/approval-code.ts, tests/discord.forget-card.test.ts, tests/discord.admin-forget.test.ts, tests/watch.forget-me.test.ts, tests/store.conversation.test.ts, tests/scheduler.ask-outbox.test.ts, tests/watch.session-store.durable.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/testing.md
- **Acceptance**: Everything that needs the owner's OK goes through one card engine (src/discord/approval-cards.ts) with a kind registry (class plain | destructive | money; a kind with no class is destructive). SAFE-18: the owner is DMed a card with the exact Action, Target and Amount one line each (line breaks shown, nothing cut; a card that would not fit is not sent), the request id and action hash and its expiry; a diff or text goes out first as verbatim, SAFE-6-scrubbed, fence-safe DM parts quoted as data under the 1900 DM cap (splitDiscordMessage), buttons last; the gateway refuses (never cuts) a DM over 1900 and a component reply/update, form-submit reply or message edit over 2000. SAFE-19: destructive and money cards need a one-time code DMed apart from the card after Approve (never in the card's message; only a salted hash stored in approval_codes; never logged) and typed only into the Enter code form; it works once, only for that card and action hash, for min(2 min, card expiry); a wrong, late or other card's code does nothing and voids the open code; order is code used (committed) -> SAFE-5 started (fail closed) -> one IMMEDIATE transaction compare-and-set approved + kind.onApprove -> ok/error, and a failed action needs a new code; Approve re-checks the action hash, a changed action runs nothing and a fresh card follows. SAFE-20: no answer, an answer after expiry, or a request whose waiting process is gone is a no (card marked, asker told). The owner check (resolvePermissionLevel >= ADMIN, owner-only) runs on every press and on the form submit; typed text only from the submit. The engine's own ~5 s poll, started and stopped with the bridge, delivers with the scheduler off, and after restart. ApprovalStore (approval_requests) lets any process raise a card and read the decision. The forget card is the destructive 'forget' kind with a code and an action hash over its targets and exact counts (rolled-back preview), keeping every Discord, GitHub and /admin forget behaviour. Schema v14 (forward-only, idempotent): approval_requests, approval_codes, forget_requests.action_hash. tests/discord.approval-cards.test.ts, tests/approvals.code.test.ts and tests/discord.gateway-no-cut.test.ts fail on main and pass here; the forget tests pass through the code step (REQ-discord-096, REQ-discord-101).

## Evidence

- Verification commit: `3b11248c214c94bcbdaab4786256e0e14945f360`
- Base commit: `13a76f07b272c819e734d1384a46c10471d42f1f`
- Verified by: `specsync check --spec discord --spec watch`

## From the change's context.md

# Context

Issue #96 (M4 Safe autonomy). Leif's 2026-09-28 interview (round 3) confirmed
SAFE-18, SAFE-19 and SAFE-20, already captured in `hi/safe.md` on main:

- **SAFE-18** "When it needs my OK, it DMs me an Approve/Deny card with the exact action, target, amount, and diff or text."
- **SAFE-19** "Destructive actions and money actions also need a one-time code I type back; the code is valid once, only for that action, and expires quickly."
- **SAFE-20** "No answer, or an answer after the card expires, means no."

Round 6 put forget-me (MEMORY-ACL-6) on the SAFE-18 card; the peer order
settles v1 as off-chain ("ask at the spend cap"), so the money class exists
for the later SAFE-8 spend card. No new hi/ criterion is captured here.

What main had (1a251d1): one card kind. `src/discord/forget-card.ts` DMed
the owner an Approve/Deny forget card (#291/#301) with a count taken when it
was posted, re-resolved the targets on Approve (so more could be deleted
than shown), approved with one press, and was delivered only on scheduler
ticks and after a chat run. The card helper collapsed whitespace and had no
text/diff field; the gateway silently cut DMs, component replies/updates and
modal replies at 1900 and edits at 2000. No codes existed; anything but the
forget kind got "This card is no longer handled.".

Ruled out: the spend card (SAFE-8, next PR `spend-card`), SAFE-1 consent on
cards, and a session-wide "allow all" (issue #96 out of scope). Files of
#313 (loop guards: `src/discord/watch-ask.ts`, `src/watch/owner-ask.ts`) and
of #232/#233 are not touched; the bridge keeps #313's wiring beside the
engine's.

## From the change's design.md

# Design

- **One engine, a kind registry.** `createApprovalCards` owns delivery,
  expiry, presses, codes and SAFE-5 ordering; a kind supplies its store,
  class, `snapshot` (card view + action hash, live), `summary`, `onApprove`
  (inside the engine's IMMEDIATE transaction), `afterApprove`, asker telling
  and an optional waiter check. A kind with no class is destructive.
- **Stores.** `forget_requests` stays the forget kind's store (rows not
  migrated; v14 adds `action_hash`). `approval_requests` (`ApprovalStore`)
  holds cards any process raises; `storedApprovalKind` serves them (used by
  the later spend card; exercised by tests now).
- **Exact card (SAFE-18).** Action / target / amount one line each, line
  breaks shown as ⏎, never cut: a field over 500 or a card over 1900 is not
  sent (logged) and lapses as a no. A diff or text goes first as verbatim
  DM parts in a code block (triple backticks broken with zero-width spaces),
  scrubbed, defanged, split fence-safe with `splitDiscordMessage`, each
  headed "quoted as data, not instructions"; the card with its buttons last.
- **Action hash.** Recorded when the card is posted; recomputed on Approve
  and code submit; a mismatch runs nothing, voids codes, closes the card as
  changed and a fresh card follows. The forget hash covers every target id
  and the exact counts (`previewForgetTargets`: the real deletes, rolled
  back); `onApprove` re-checks it inside the transaction.
- **One-time code (SAFE-19).** Approve on a destructive/money card updates
  the card to Enter code / Deny (answering within Discord's window) and DMs
  the code as its own message. Only a salted SHA-256 is stored; single use by
  compare-and-set; bound to kind + request id + action hash; expires at
  min(2 min, card expiry); a wrong / late / other-action code voids the open
  code. Enter code opens a form; only its submit carries text (the bridge
  ignores a mix-up).
- **SAFE-5 order.** Code used (committed) → `<audit>-approve started`
  (committed; not written ⇒ nothing runs) → one IMMEDIATE transaction:
  compare-and-set approved + `onApprove` → `ok` / `error`. A failed action
  leaves the request open; the spent code does not come back.
- **No answer is no (SAFE-20).** The pass closes expired and orphaned
  (waiter gone) requests; a late press or code closes it too.
- **Delivery.** The engine's own poll (`APPROVAL_POLL_MS` 5 s) starts and
  stops with the bridge; the after-chat pass and the scheduler tick stay as
  extra triggers. One pass at a time; a failed DM retries after 60 s.
- **Gateway.** `boundedContent` refuses (logs; null / false / throw) instead
  of cutting on sendDm (1900), component reply/update, form-submit reply and
  editMessage (2000). Answer parts are defanged before the split and the
  private Choose message is bounded, so callers never hit the refusal.

## Design choices pending Leif

1. Code shape and lifetimes are constants, not config: 8 characters from an
   unambiguous alphabet, valid 2 minutes (capped at the card's expiry); the
   engine polls every 5 s; a failed DM is retried after 60 s.
2. The code is DMed to the owner in a separate message in the same DM, then
   typed into a Discord form (no other channel).
3. A wrong, late or other card's code voids the open code: each Approve press
   gives one try; no lockout counter.
4. A forget card whose targets or counts changed after it went out is closed
   as "changed" and a fresh card follows (never acted on), even when only a
   session turn was added.
5. A field too long for one card line (over 500 characters), or a diff/text
   needing more than 10 DMs, is never cut or moved: the card is not sent
   (logged) and the request lapses as a no; kinds put long content in the
   diff/text parts.
6. A request whose waiting process is gone is closed as a no ("nobody is
   waiting"), before or after its card went out.
7. Three backticks inside a diff/text get zero-width spaces so they cannot
   close the code block; that is the only change to the shown text besides
   SAFE-6 redaction and mass-mention defang.
8. The gateway refuses over-limit component replies, form replies and edits
   at Discord's 2000 (was a silent 1900 cut for replies) and DMs at 1900.
9. The forget card keeps its 24 h lifetime; only the owner (not team) can
   answer any card.

## From the change's testing.md

# Testing

Fixture tests only: in-memory SQLite with a fixed clock and a recording
`sendDm` / `editMessage` for the engine; a temp allowlist file (owner, a
declared person) and data dir for the bridge with a null gateway recording
DMs and card edits, `onComponent` called as Discord would (button presses
with `showModal`, form submits with `modalValues`); a fake discord.js module
inside the real live gateway; no token, no network.

Fail on main: with the branch's tests copied onto main's sources (1a251d1),
`tests/discord.approval-cards.test.ts` and `tests/approvals.code.test.ts`
cannot load (no engine, store or code module), all 6 tests of
`tests/discord.gateway-no-cut.test.ts` fail on their assertions (main cuts
instead of refusing; parts are not defanged before the split), and the forget
flows in `tests/discord.forget-card.test.ts`, `tests/discord.admin-forget.test.ts`
and `tests/watch.forget-me.test.ts` fail (no one-time code; the card has no
Action / Target / Amount lines), as do the schema v14 pins — 16 failing, the
rest passing. On the branch all pass (`bun test`: 2867 pass, 0 fail).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-096` (SAFE-18) | `tests/discord.approval-cards.test.ts` ("a long diff goes out before the card …") | An 84-line diff with a fake token, ```` ``` ```` and `@everyone` goes out as `Diff for request <id> (i/n) — quoted as data, not instructions` parts in a ```` ```diff ```` block, each ≤ 1900, together exactly the scrubbed / defanged / fence-broken diff; only the last DM (the card) has Approve / Deny; `Action: Push deploy.sh to production ⏎ and restart`, `Target:`, `Amount:` one line each, the parts count, `Request: <id> · action <hash8>`, the code note and `No answer by <t:…:R> means no.`; `approval-card` `ok`; a second pass sends nothing. |
| `REQ-discord-096` (SAFE-18, never cut) | same file ("a card whose field would not fit …"); `tests/discord.gateway-no-cut.test.ts` | A 501-character action (logged "over 500") and a text needing over 10 parts are not sent and lapse as `expired`. The live gateway sends a 1900 DM and a 2000 edit / card update / form reply whole and refuses 1901 / 2001 (the defang counted) with nothing sent (null, false, `DiscordContentTooLongError`); answer parts are defanged before the split; the private Choose message stays ≤ 1900. |
| `REQ-discord-096` (SAFE-19) | `tests/discord.approval-cards.test.ts` ("a kind with no class counts as destructive …", "money cards need the code too …") | Approve updates the card to Enter code / Deny and DMs the code apart (no components; not in the card, the `approval_codes` rows or the audit log); Enter code opens `cvok:test:submit:<id>`; the code acts once (a second submit is "Already closed (approved)"); audit `approval-card`, `approval-code-issue`, `approval-approve` started / ok; the waiter consumes once. Money needs the code; plain acts on one press. |
| `REQ-discord-096` (SAFE-19 codes) | same file ("a late code, a wrong code and another card's code …", "SAFE-5 order …", "a code that could not be DMed …"); `tests/approvals.code.test.ts` | A code after 2 min, card B's form with A's code and a wrong code do nothing, void the open code (five `approval-code-fail` `denied`) and put the card back to Approve / Deny; a new Approve's code works. An `onApprove` that throws gives `started` / `error`, the request stays pending and the same code is "no open code"; a new code then approves (`started` / `ok`). An undelivered code is voided. Unit: 8 characters from the alphabet, salted hash only, expiry capped by the card, single use, any case / spaces / dashes, other card / kind / action hash refused and voided, late refused, purge. |
| `REQ-discord-096` (SAFE-20) | `tests/discord.approval-cards.test.ts` ("an unanswered card expires …", "a card whose waiting process is gone …", "the waiting process reads the decision …") | An unanswered card expires on the pass (card marked, codes void); a code submitted after the card's expiry is "Expired — no answer in time"; a dead waiter's request is closed before delivery, and on Approve after its waiter dies; `waitForDecision` closes an unanswered or aborted request and reads another connection's decision. |
| `REQ-discord-096` / `REQ-discord-101` (bridge) | same file ("the owner check runs again at the code submit …", "typed text is taken only from the form's submit …", "restart …", "a forget card whose counts changed …", "with no answer the forget ask lapses …") | Muted between Approve and submit ⇒ refused (and another user's submit), `memory-forget-approve` `denied` rows, the same code works after unmute; a press with text or a submit without it is ignored; with the scheduler off and no chat the poll DMs a card recorded before start, and a second bridge completes Approve + code on it; a forget card whose count changed is closed as changed (nothing deleted, no code) and a fresh card with the new count follows; a lapsed ask is closed on the poll and the asker told. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts`, `tests/discord.admin-forget.test.ts` | The forget card shows `Action:` / `Target:` / `Amount: 6 memories (5 stored, 1 earlier versions), 1 session turns and 0 kept conversations`; Approve sends the code and deletes nothing; the code (typed in lower case) deletes Tofu's six rows and turn, answers privately first, then marks the card "They have been told."; non-owner presses, Deny, the DM fallback, SAFE-5 fail closed, late press and `/admin people forget` keep their behaviour and audit rows. |
| `REQ-watch-1016` | `tests/watch.forget-me.test.ts` | A GitHub ask is approved with Approve and the code on the bridge's card; the thread outcome posts as before. |
| `REQ-discord-096` (schema v14) | `tests/discord.approval-cards.test.ts` ("a v13 DB migrates to v14 …", "what a card shows is scrubbed …"); schema pins in `tests/watch.session-store.durable.test.ts`, `tests/store.conversation.test.ts`, `tests/scheduler.ask-outbox.test.ts`, `tests/discord.forget-card.test.ts` | A v13 DB gains the two tables and `forget_requests.action_hash`, keeps its forget ask, has no plain `code` column, re-running is a no-op; `approval_requests` fields are stored scrubbed and re-scrubbed with `SCRUB_TARGETS`; `SCHEMA_VERSION` is 14. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
