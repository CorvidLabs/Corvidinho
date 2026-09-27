---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: plan
---

# Plan

1. Re-check the gap on current origin/main (fc0ed8d): files-read decodes an
   image as UTF-8; no `image_url` part anywhere in `src/` or `plugins/`.
2. `plugins/files/image.ts`: magic-byte sniff (PNG / JPEG / GIF / WebP) and
   size, reusing `MAX_IMAGE_SIZE_BYTES` / `ImageMediaType` from
   `src/discord/image-attachments.ts`.
3. `src/plugins/types.ts`: optional `PluginHandlerResult.image`
   (`PluginImage`).
4. `plugins/files/commands.ts`: image branch after `assertExistingFile`.
5. `src/agent/execute.ts`: `ChatMessage.content` widened to parts; one
   image user message per round after the tool messages; HTTP status on
   provider errors; one retry with a text note on a 400 carrying images.
6. Regression tests in `tests/files.plugins.test.ts`,
   `tests/agent.tool-loop.test.ts`, `tests/discord.image-attachments.test.ts`;
   prove they fail with main's sources swapped in and pass on the branch.
7. Specs (plugins / agent / discord spec, requirements, testing), deltas,
   `.env.example` note.
8. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
