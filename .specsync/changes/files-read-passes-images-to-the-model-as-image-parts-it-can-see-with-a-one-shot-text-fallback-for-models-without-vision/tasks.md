---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: tasks
---

# Tasks

- [x] Re-check the DISCORD-9 gap on origin/main (repro: files-read of a real PNG returns U+FFFD garbage)
- [x] `plugins/files/image.ts` magic-byte sniff + size
- [x] `PluginHandlerResult.image` (`PluginImage`) in `src/plugins/types.ts`
- [x] files-read image branch after clamp / secret gate / existing-file check; 20 MB cap
- [x] Tool loop: image user message after the round's tool messages; base64 kept out of tool text, events, ndjson
- [x] Tool loop: HTTP 400 on image parts → text note + one retry; later images as the note
- [x] Regression tests (fail on main, pass on branch)
- [x] Specs, requirements, testing companions, deltas, `.env.example` note
- [x] specsync check, tsc, bun test, fledge verify lane green
