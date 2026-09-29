---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: research
---

# Research

- Discord rejects a message or interaction reply whose components repeat a
  `custom_id` (component custom ids must be unique within the message), so
  the Choose press that sends `buildChoiceComponents` fails outright.
- Where option ids come from: `askFromToolArguments` / `askFromUnknown`
  (`src/agent/ask.ts`) and the bridge (`resolveAskOptions` on the run's
  ask, `bridge.ts`) both go through `normalizeAskOptions`; numbered-list
  parsing (`parseChoicesFromQuestion`) already numbers `1..n` and cannot
  collide. `findOptionLabel` returns the first option with the id.
- Expiry today: `isAskExpired` is checked on a press (`onComponent`), and
  `SessionStore.clearPendingAsk` drops timed-out earlier asks when it
  promotes one. Nothing clears the newest ask when it times out, and the
  onMessage thin-ack branch looked only at `session.pendingAsk`.
- Reused, no new code paths: `isAskExpired` (already imported in
  `bridge.ts`), `isCancelAsk` / `promptBodyForAskGate`,
  `SessionStore.clearPendingAsk` (promotion + persistence).
- Repro on the base (`0f2e2c2`): the new tests below; 8 of the 11 fail.
