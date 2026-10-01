---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: design
---

# Design

- **One gate**, `src/discord/public-reply-gate.ts`:
  `createPublicReplyGate({ db, owner, lookup, post, edit, remove, deliver })`
  → `isPublicThread` (the gateway's lookup at post time; a throw is public),
  `mustHold` (count < 20, then the lookup), `hold(input)` and `close()`.
  `hold` returns the text to post (as given when it need not wait, else the
  stored, scrubbed text of the approved card) or a no (`denied` | `expired` |
  `stopped` | `no-owner` | `unavailable`). It records the `reply` request
  first (no card ⇒ no hold line), runs a card pass, shows the hold line
  (`showHold` on the progress message or deferred slash reply, else a note
  it posts and later removes or turns into the not-posted line), waits with
  `ApprovalStore.waitForDecision` (signal = the run's stop and the gate's
  close), then consumes and counts in one IMMEDIATE transaction.
- **The count**: `schema_meta` key `public_thread_replies_approved`,
  incremented only when an approval is used; read as 0 when unreadable.
- **Public thread**: `isPublicThreadType(type)` = Discord types 11 / 10 (fixed
  API numbers, so a discord.js enum without a member cannot match
  `undefined`); `GatewayHandlers.isPublicThread` in the live gateway fetches
  the channel (cached by discord.js).
- **Card kind**: `publicReplyApprovalKind` = `storedApprovalKind` kind
  `reply`, class plain, audit `public-reply`, "nothing was posted"; the
  bridge registers it beside forget, must-ask and spend.
- **Surfaces** (only where the body carries model text — `!stopped &&
  (ask ? reason !== "spend-cap" : ok)`): chat and ask-pick answers hold on
  the progress message before the pending ask is set, the turn recorded and
  the answer finalized; a no turns the answer into the fixed line (or ⏹
  Stopped when the run was stopped; nothing when the bridge closed, its
  in-flight row kept). The thin-ack restatement holds with a note.
  `/session start` and `/work` hold through `holdSlashReply` (slash-finish)
  before `setPendingAsk`, the agent turn and `finishSlashWithOwnerNotice`; a
  no finishes with the line only. The scheduler marks its result and ask
  posts `modelText`; the bridge's poster holds them and answers true for a
  final no, false for a stop / no owner / no card.
- **Files**: the bridge computes `mustHold(channel)` before each chat, ask,
  `/session start` and `/work` spawn and passes `replyPublicThread`; the
  spawn client writes the stamp; `sendFileMustAsk` raises the must-ask
  gate's `public` class card (caption + `[attachment: …]`) when stamped and
  still under 20, after the handler's own refusals.
- **Stop**: the hold's signal is the run's turn signal, so the Stop button
  and stop words end the wait; `bridge.stop()` calls `close()`.
