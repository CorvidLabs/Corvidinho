---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: testing
---

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
