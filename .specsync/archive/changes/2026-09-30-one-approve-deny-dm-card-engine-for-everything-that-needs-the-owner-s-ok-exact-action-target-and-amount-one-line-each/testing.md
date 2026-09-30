---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: testing
---

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
