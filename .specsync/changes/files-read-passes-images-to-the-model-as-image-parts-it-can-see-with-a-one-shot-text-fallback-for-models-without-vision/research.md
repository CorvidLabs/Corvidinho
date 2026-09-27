---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: research
---

# Research

- OpenAI-compatible chat/completions accepts user content arrays with
  `{type:"image_url", image_url:{url:"data:<mime>;base64,…"}}`; tool messages
  are text-only and must directly follow the assistant `tool_calls`, so
  images go in a user message after them.
- Providers without vision (or that reject data URLs) answer HTTP 400; error
  bodies vary, so the status alone triggers the fallback.
- `src/discord/image-attachments.ts` already defines the format allowlist and
  20 MB cap (corvid-agent steal); `buildMultimodalContent` builds
  Anthropic-shaped blocks with no caller, so it is not reused for the
  OpenAI-shaped loop.
- SAFE-8: the spend guard's pre-call estimate is request bytes / 3, so an
  image raises the estimate (settled to provider usage after the call).
