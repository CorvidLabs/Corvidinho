---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: design
---

# Design

- `src/discord/injection-guard.ts`: `SpeakerSurface` gains `ask-pick` (the
  label of a Choose option the speaker picked). `fenceSpeakerText` is reused
  unchanged: the owner's text is returned as is, team / community text is
  wrapped in the `UNTRUSTED_DATA` fence with the role header.
- `src/discord/bridge.ts` pick branch:
  1. `findOptionLabel(pending.options, parsed.optionId)`; when it finds none,
     reply `{ content: ASK_CHOICE_EXPIRED, ephemeral: true }` and return —
     before `clearPendingAsk`, so the ask stays pending and nothing is
     recorded, posted, edited or run. The raw-id fallback is gone.
  2. Otherwise unchanged claim, "Got it — **label**" update with the buttons
     cleared (DISCORD-ASK-8) and the button prior-question block, and
     `spoken = fenceSpeakerText(answer, actingRole, "ask-pick")` with the role
     #299 resolves at press time (`resolveDiscordActingRole` with
     `interaction.roleIds`). `humanText`, the memory query and the recorded
     turn keep `answer` (the plain label).
- The owner's prompt is byte-identical (`fenceSpeakerText` returns the text
  for `owner`); checked by dumping the owner's resumed prompt on the base and
  the branch bridge (identical, 1056 bytes).
- No env var, config key, table, column or schema version.

Design choices pending Leif:

1. Unmatched option id: refused as expired (ephemeral "that choice expired",
   no run, the ask left open so a real pick / answer / reply still works),
   for everyone including the owner, rather than fenced and passed through.
   The brief allowed either; refusing is the conservative option and a
   forged id never reaches a run at all.
2. Fence source `ask-pick` (a new `SpeakerSurface`) rather than reusing
   `ask-answer`, so the model sees the words came from a picked button. The
   fence format and header are the same as for typed words.
3. A picked label is fenced but not scanned by the SAFE-13 detector: the
   captured text asks for the fence only, and a model-written label that
   tripped the tripwire would otherwise block the requester's own answer. The
   run's own tool-result tripwire and the role cap still apply.
