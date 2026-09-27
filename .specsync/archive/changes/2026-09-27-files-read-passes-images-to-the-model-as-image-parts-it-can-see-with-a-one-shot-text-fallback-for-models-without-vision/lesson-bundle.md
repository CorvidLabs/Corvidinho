# Lesson bundle — files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9)
- **Kind**: Feature
- **Specs**: plugins, agent, discord
- **Paths**: plugins/files/commands.ts, plugins/files/image.ts, src/plugins/types.ts, src/agent/execute.ts, tests/files.plugins.test.ts, tests/agent.tool-loop.test.ts, tests/discord.image-attachments.test.ts, .env.example, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, specs/agent/agent.spec.md, specs/agent/requirements.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: files-read on a PNG/JPEG/GIF/WebP file (sniffed by magic bytes, after the path clamp and the ROLES-CHAT-8 secret gate) returns image metadata (path, bytes, mediaType, image:true) and no UTF-8 content, and refuses an image over 20MB; text files read exactly as before; in the tool loop, the round after a files-read of an image sends one user message holding an image_url data-URL part with the file's bytes, after that round's tool messages, while the tool message, ToolResult events and ndjson never carry the base64; if that request gets HTTP 400 the loop swaps the image parts for a text note and retries once, so a model without vision still completes; tests in tests/files.plugins.test.ts, tests/agent.tool-loop.test.ts and tests/discord.image-attachments.test.ts fail on main and pass on the branch

## Evidence

- Verification commit: `6a2d02681b3863ac0b79512a6bdcf26947bc9cdc`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

HI DISCORD-9 (hi/discord.md, captured, no retire): "Images I attach are
available to the agent as files it can actually look at." Issue #76.

On main (fc0ed8d) the bridge half works: attachments are downloaded into
`<session cwd>/.corvidinho/attachments/` and the prompt cites
`[image: name (mime WxH) <abs path>]` with "Open the local path(s) above to
look at it" (REQ-discord-013). But the model never receives the image:

- `files-read` runs `readFileSync(abs, "utf8")` and returns the lossy decode
  as `message` and `data.content`. A real 1x1 PNG comes back as
  `{"ok":true,"message":"\uFFFDPNG\r\n\u001a\n…` with 20 U+FFFD; a 2 MB PNG gives
  a ~6M-char tool payload, past any context window.
- The tool loop is text-only: `ChatMessage.content` is `string | null`, tool
  results go out as `JSON.stringify` of the whole result, and no `image_url`
  part is ever sent (no match in `src/` or `plugins/`).
- The bridge e2e test used a 4-byte fake PNG and only checked `read.ok`.

So following the bridge's own "open the path" directive feeds the model
garbage or breaks the run; "actually look at" needs the pixels to reach the
model.

Constraints: HI-first, no new slash command, env var, CLI flag, protocol
field or SQLite schema change; no bridge edits; base64 must stay out of
ndjson / Discord status (DISCORD-3) and out of logs; the image branch runs
after the path clamp and the ROLES-CHAT-8 secret gate, never before.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-427` | `tests/files.plugins.test.ts` ("files-read image mode (DISCORD-9 / REQ-plugins-427)") | "files-read on a PNG returns image metadata, not UTF-8 content": `data` `{path, bytes, mediaType: image/png, image: true}`, no `content`, `result.image.base64` round-trips, stringified result < 1 KB, no U+FFFD, no base64. "images are told apart by magic bytes, not by name": JPEG / GIF / WebP heads, PNG named `.txt` is an image, text named `.png` is text. "files-read refuses an image over 20MB" (sparse file; exactly 20 MB still read). Guards (pass on main too): "a text file reads exactly as before"; "the path clamp and the ROLES-CHAT-8 secret gate still run first". The first three fail with main's `plugins/files/commands.ts` / `src/plugins/types.ts` swapped in. |
| `REQ-agent-428` | `tests/agent.tool-loop.test.ts` ("files-read images reach the model as image parts (DISCORD-9 / REQ-agent-428)") | Fake `fetchImpl`: round-2 body has the small tool message directly followed by the user message `[text, image_url(data:image/png;base64,…)]`; two images → one user message after both tool messages; ToolResult detail and ndjson lines hold no base64; HTTP 400 on the image request → one retry whose tool message says `[image shot.png could not be shown to this model]` and with no user message after the tool messages, run completes without error; a provider that 400s a user message right after tool messages (role order) still completes; 404 / 413 / 415 / 422 fall back too, 401 / 429 / 500 stay errors; a refusal drops earlier rounds' images too; a later image after a refusal gets the note in its tool message with no second retry; 400 on the retry, or with no image, stays an error. All 9 fail with main's `src/agent/execute.ts` / `plugins/files/commands.ts` / `src/plugins/types.ts` swapped in; the 5 fallback tests also fail on the first-cut fallback (note as a user message, 400 only). |
| `REQ-discord-013` (modified) | `tests/discord.image-attachments.test.ts` ("agent files-read opens the image under the session cwd as an image part; …") | Bridge e2e now downloads a real PNG; files-read on the prompt's cited path returns `mediaType` `image/png` and base64 equal to the downloaded bytes; git status clean; session end deletes it. Fails on main (no `image`). |
| `REQ-agent-008` / `REQ-agent-242` | `tests/agent.tool-loop.test.ts` | Existing tool-loop, abort, filesChanged and provider-error tests still pass. |

Fail-on-main proof: with main's `plugins/files/commands.ts`,
`src/agent/execute.ts` and `src/plugins/types.ts` swapped in, the three test
files give 44 pass / 10 fail (the 10 new behaviour tests); restored, 54 pass /
0 fail.

## Automated coverage

- `bun test tests/files.plugins.test.ts tests/agent.tool-loop.test.ts tests/discord.image-attachments.test.ts`
- Full suite: `bun test`; `bunx tsc --noEmit`; `specsync check --require-coverage 100`; `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
