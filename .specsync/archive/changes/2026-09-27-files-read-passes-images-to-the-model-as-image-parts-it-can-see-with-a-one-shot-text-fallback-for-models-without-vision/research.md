---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: research
---

# Research

- OpenAI-compatible chat/completions accepts user content arrays with
  `{type:"image_url", image_url:{url:"data:<mime>;base64,…"}}`; tool messages
  are text-only and must directly follow the assistant `tool_calls`, so
  images go in a user message after them.
- Providers without vision (or that reject data URLs) answer HTTP 400;
  OpenRouter answers 404 ("No endpoints found that support image input");
  proxies answer 413 for large bodies; some servers 415 / 422 on content
  parts. Error bodies vary, so the status alone triggers the fallback.
- Some OpenAI-compatible APIs (Mistral) reject a user message right after
  tool messages with a 400, so the fallback puts the note in the tool
  message and leaves no user message after the tool messages.
- `src/discord/image-attachments.ts` already defines the format allowlist and
  20 MB cap (corvid-agent steal); `buildMultimodalContent` builds
  Anthropic-shaped blocks with no caller, so it is not reused for the
  OpenAI-shaped loop.
- SAFE-8: the spend guard's pre-call estimate is request bytes / 3, so an
  image raises the estimate (settled to provider usage after the call).
