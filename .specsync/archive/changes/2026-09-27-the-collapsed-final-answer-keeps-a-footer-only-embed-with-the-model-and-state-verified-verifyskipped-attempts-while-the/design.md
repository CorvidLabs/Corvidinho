---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: design
---

# Design

- `src/discord/thinking-status.ts`: new `buildAnswerFooterEmbed({ phase,
  model, plumbing })` returns `{ color: phaseColor(phase), footer: { text:
  "model | plumbing" } }` (segments that are unknown are left out; no
  description), or null when neither is known. `DiscordEmbedPayload.description`
  becomes optional; the gateway already maps embeds as raw objects, so an
  undefined description is simply not sent.
- `ThinkingStatus.finalizeContent` takes optional `extras` (`plumbing`,
  `model`, same shape as `done()`/`fail()`) and `failed`. It stores them,
  then edits with `embed: null` when `components` is non-empty (the Choose
  stub, DISCORD-ASK-6) and with the footer-only embed otherwise. The phase
  (done/error) is kept after a successful edit, so a later re-edit (the SAFE-8
  owner notice appended by `finishSlashWithOwnerNotice`) keeps the same footer
  and color without the caller passing them again.
- Callers pass what they already pass to the fallback: `bridge.ts` chat and
  button-pick paths pass `thinkExtras` and `failed: askBody ? askBody.failed :
  !result.ok`; `finishSlashWithThinking` passes `opts.thinkExtras` and
  `failed: askStatus ? askStatus.failed : !ok`. So the collapsed answer's color
  matches the done/error status the fallback would have shown.
- The rule "no footer on a Choose stub" lives in `finalizeContent`
  (components present), so any future caller that collapses into a button
  stub gets the DISCORD-ASK-6 layout without extra wiring.
- Fallback path (`done()`/`fail()` + separate reply) unchanged.
