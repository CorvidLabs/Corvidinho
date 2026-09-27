---
id: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
state: archived
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9)

## Intent

files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9)

## Affected Canonical Specs

- `plugins`
- `agent`
- `discord`

## Acceptance Criteria

- files-read on a PNG/JPEG/GIF/WebP file (sniffed by magic bytes, after the path clamp and the ROLES-CHAT-8 secret gate) returns image metadata (path, bytes, mediaType, image:true) and no UTF-8 content, and refuses an image over 20MB; text files read exactly as before; in the tool loop, the round after a files-read of an image sends one user message holding an image_url data-URL part with the file's bytes, after that round's tool messages, while the tool message, ToolResult events and ndjson never carry the base64; if that request gets HTTP 400 the loop swaps the image parts for a text note and retries once, so a model without vision still completes; tests in tests/files.plugins.test.ts, tests/agent.tool-loop.test.ts and tests/discord.image-attachments.test.ts fail on main and pass on the branch

## No-spec Rationale

Not applicable
