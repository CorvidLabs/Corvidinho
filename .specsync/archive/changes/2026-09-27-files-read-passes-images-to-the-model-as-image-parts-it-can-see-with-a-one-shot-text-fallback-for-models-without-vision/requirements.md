---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: requirements
---

# Requirements

- `REQ-plugins-427` (Added, plugins): files-read image mode — magic-byte
  sniff after the clamp / secret gate / existing-file check; metadata in
  `data` + `message`, bytes only on the never-serialized `result.image`; over
  20 MB refused; other files unchanged.
- `REQ-agent-428` (Added, agent; extends REQ-agent-008): the tool loop sends
  a round's images as one user message of `image_url` data-URL parts after
  the round's tool messages; base64 never in tool text, events or ndjson; one
  retry with a text note in the tool message on HTTP 400 / 404 / 413 / 415 /
  422; later images as the note.
- `REQ-discord-013` (Modified, discord): the bridge acceptance criterion
  "`files-read` with that cwd opens it" becomes "opening the cited path with
  `files-read` gives the model the image itself (an image part), not decoded
  bytes".

HI: DISCORD-9 only. No other acceptance criteria were invented.
