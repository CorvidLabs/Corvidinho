---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: research
---

# Research

- Discord modals: an interaction response of type 9 (MODAL) with `custom_id`,
  `title` (≤45) and components; the submit arrives as interaction type 5
  (MODAL_SUBMIT) with the same `custom_id` and the input values. A modal can
  answer a component press or a slash command, not a modal submit. A text
  input (type 4) paragraph style is 2, `max_length` ≤ 4000; inside a Label
  (type 18, `label` ≤45, `description` ≤100) is the current layout (a text
  input's own `label` in an Action Row is deprecated).
- discord.js 14.27 (installed): `showModal(modal)` posts `type: Modal` with the
  JSON as given (snake_case passes through); `ModalSubmitInteraction.fields`
  collects both Action Row and Label inputs into `fields.fields` (a
  Collection of `{ type, customId, value }`); `message` is the stub when the
  modal came from a message button; `reply` with flag 64 is ephemeral.
- The press gates live in `onComponent` (channel → actor → mute/rate →
  late/closed → not-yours → expiry), so routing the submit there reuses them
  unchanged.
- The session thread (AGENT-6) already scrubs recorded turns; the typed answer
  is scrubbed before it reaches the prompt too, since it arrives outside chat.
