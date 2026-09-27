---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: design
---

# Design

- `plugins/files/image.ts`: `sniffImageMediaType(head)` (PNG 8-byte
  signature, JPEG `FF D8 FF`, `GIF87a` / `GIF89a`, `RIFF….WEBP`) and
  `sniffImageFile(abs)` (reads 12 bytes + `fstat` size on one fd).
  `MAX_IMAGE_SIZE_BYTES` and `ImageMediaType` come from
  `src/discord/image-attachments.ts`, so the cap and the format set match
  Discord attachments.
- `src/plugins/types.ts`: `PluginImage {path, mediaType, base64}` and optional
  `PluginHandlerResult.image`. Only the tool loop reads it;
  `stringifyToolPayload`, the CLI's `plugins run` printer and ndjson all pick
  named fields, so the base64 is never serialized.
- `plugins/files/commands.ts` (`files-read`): after `resolveProjectPath`, the
  ROLES-CHAT-8 gate and `assertExistingFile`, `sniffImageFile`; an image goes
  to `readImage` (size check before and after the read, then metadata + the
  `image` field). Text files take the unchanged path.
- `src/agent/execute.ts` (`runToolLoop`):
  - `ChatMessage.content: string | ChatContentPart[] | null`; provider replies
    are typed `AssistantMessage` (text only).
  - Per round, images from `ok` results collect in `roundImages`; after the
    last tool message one user message `[text "Image(s) opened with
    files-read: <paths>", image_url…]` is pushed and remembered in
    `imageMessages`.
  - `chatCompletions` errors carry `status`. A 400 / 404 / 413 / 415 / 422
    (`IMAGE_REFUSED_HTTP_STATUSES`) while `imageMessages` is non-empty
    removes those user messages, rewrites each opened image's tool message
    to the note (`imageRefusedToolContent`: metadata kept, message
    `[image <path> could not be shown to this model]`), sets
    `imagesRefused`, emits `[operator] the model refused image input (HTTP
    <status>); retried once with a text note`, and repeats the request once.
    The retry has no user message after tool messages, so a provider that
    rejects that role order (e.g. Mistral's "Unexpected role 'user' after
    role 'tool'") accepts it. With `imagesRefused`, later image tool
    messages carry the note and no image message is pushed. A second
    failure is returned as today.
- No bridge change, no new env var / flag / slash command / protocol field,
  no schema bump.

## Design choice pending Leif

Scoping left no open question; these were picked as the most conservative
options consistent with DISCORD-9:

- Images stay in the conversation for later rounds (re-sent each request);
  no "latest image only" trimming.
- Fallback trigger is HTTP 400 / 404 / 413 / 415 / 422 (400: no vision or
  a bad image; 404: a gateway such as OpenRouter with no image-capable route
  for the model; 413: payload too large; 415 / 422: a server that rejects
  content parts), one retry per run. 401 / 403 / 429 / 5xx are not image
  refusals and stay errors. (Widened in review from 400 only.)
- No per-round image count cap beyond the tool-round budget; the 20 MB
  per-image cap matches Discord attachments.
