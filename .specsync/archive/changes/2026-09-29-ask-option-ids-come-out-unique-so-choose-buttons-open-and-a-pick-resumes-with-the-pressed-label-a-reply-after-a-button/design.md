---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: design
---

# Design

- `src/agent/ask-options.ts`: `normalizeAskOptions` keeps a `Set` of the
  ids already given to kept options. Each kept option's id (explicit, cut to
  32 chars, or its position fallback) goes through `claimOptionId`: when
  the id is free it is kept as is; when taken, the first unused position
  number (`"1"`, `"2"`, …) is used. The id is claimed only after the label
  survives `toOption`, so a dropped empty option holds no id. An ask whose
  ids are already unique comes out byte-identical (same objects, same key
  order), so stored asks, the bridge's re-normalization of an agent ask
  (`resolveAskOptions` in `bridge.ts`) and open buttons are unchanged.
  With at most `ASK_OPTIONS_MAX` (5) options the loop ends within 6 tries.
- `src/discord/bridge.ts` `onMessage`: before the thin-ack/cancel branch,
  when the action is `continue_session`, the session's `pendingAsk` has
  options (a button ask), `isAskExpired(pendingAsk)` is true and the
  message is not a cancel, call `store.clearPendingAsk(session,
  pendingAsk.askId)`. That existing store call promotes the newest open ask
  that has not timed out (dropping timed-out earlier ones) or leaves none.
  The existing branch then restates a live ask for a thin reply, or the
  message runs the agent. A substantive reply runs the agent exactly as
  before (a button ask never added a prior-question block). A cancel skips
  the clear so it still gets `ASK_CANCELLED_ACK` and clears every open ask.
- Free-text asks are untouched (DISCORD-ASK-5 is about button prompts).
- Trade-off: after the clear, a press on the dropped ask is a press on a gone
  ask. On this base that answers "This choice isn't for you (or it was
  already answered)", the same reply main already gives for a timed-out
  earlier ask dropped by `clearPendingAsk`; the sibling late-press PR turns
  it into "that choice expired". The new tests do not assert that reply, so
  they hold with or without the sibling change.
