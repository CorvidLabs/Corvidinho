---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: design
---

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
