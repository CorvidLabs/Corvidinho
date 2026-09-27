---
module: agent
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
---

# Delta — agent (tool loop sends files-read images as image parts, DISCORD-9)

## Added

### REQUIREMENT REQ-agent-428

When a tool-loop round's tool results carry an image (`PluginHandlerResult.image`,
`files-read` REQ-plugins-427), the tool loop (REQ-agent-008) SHALL, after it
has pushed all of that round's tool messages, add one user message whose
content is a text part `Image(s) opened with files-read: <paths>` followed by
one `image_url` part per image with a `data:<mime>;base64,<bytes>` URL, so the
model sees the pixels (DISCORD-9). The tool message and the `ToolResult` event
detail SHALL keep only the metadata; the base64 SHALL NOT appear in tool text,
events or ndjson. If a chat/completions request that carries image parts gets
HTTP 400, 404, 413, 415 or 422 (a model or gateway that will not take the
images), the loop SHALL remove every image user message, set the message of
each opened image's tool message to `[image <path> could not be shown to this
model]` (metadata kept, no bytes), emit an `[operator]` Text note and retry
that request once, so the retry has no user message after tool messages;
later images in the same run SHALL get that note in their tool message and no
image message. Any other status (auth, rate limit, server error), a failure on
the retry, or a failure on a request with no image parts SHALL stay a provider
error (REQ-agent-242). No new env var, flag or protocol field.

Acceptance Criteria
- Mock HTTP: round 1 `files-read` of a PNG; the round 2 body has the small tool message (no base64) directly followed by the user message `[text, image_url(data:image/png;base64,…)]`; the round 1 body has no image part.
- Two images in one round ride one user message after both tool messages, with two `image_url` parts.
- The `ToolResult` detail and the run's ndjson lines never contain the base64.
- HTTP 400 on the image request: one retry whose tool message carries the text note, with no user message after the tool messages and no base64; the run completes with the model's reply and no error flag.
- A provider that rejects a user message right after tool messages (role order, HTTP 400) still completes on that retry.
- 404 / 413 / 415 / 422 on the image request fall back the same way; 401 / 429 / 500 stay errors with no retry.
- A refusal also removes the image messages of earlier rounds; each opened image's tool message carries the note.
- After that refusal, a later image in the run goes as the note in its tool message with no second retry.
- 400 again on the retry → error flag with `LLM HTTP 400`; 400 with no image sent → error, no retry.
- Fixture: `tests/agent.tool-loop.test.ts`, no live provider.
