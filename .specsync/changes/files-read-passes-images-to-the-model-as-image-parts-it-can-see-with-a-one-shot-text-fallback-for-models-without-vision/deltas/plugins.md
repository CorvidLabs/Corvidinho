---
module: plugins
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
---

# Delta — plugins (files-read image mode, DISCORD-9)

## Added

### REQUIREMENT REQ-plugins-427

`files-read` SHALL recognise a PNG, JPEG, GIF or WebP file by its leading
magic bytes (not its name) and, after the path clamp (REQ-plugins-082), the
ROLES-CHAT-8 secret-path gate and the existing-file check, SHALL return it as
an image the model can look at (DISCORD-9): `data` `{path, bytes, mediaType,
image: true}` and the message `image <path> (<mime>, N bytes) opened for
viewing`, with no UTF-8 `content`. The file's bytes SHALL travel base64 only on
`PluginHandlerResult.image` `{path, mediaType, base64}`, which is never
serialized into tool text, events, ndjson or CLI output; the agent tool loop
sends it to the model as an image part (REQ-agent-428). An image over 20 MB
(`MAX_IMAGE_SIZE_BYTES`, the Discord attachment cap) SHALL be refused with a
clear error and no bytes. Any other file SHALL read exactly as before. No new
env var, flag or command.

Acceptance Criteria
- files-read of a real PNG under `<cwd>/.corvidinho/attachments/` returns `data.image` true, `mediaType` `image/png` and no `data.content`; `image.base64` round-trips to the file bytes; `{ok, message, data}` stringified is under 1 KB with no U+FFFD and no base64.
- JPEG / GIF / WebP heads are images whatever the name; a text file named `.png` reads as text; a PNG named `.txt` is an image.
- An image over 20 MB is refused (`refused: image '<path>' is N bytes, over the 20MB image limit`); an image of exactly 20 MB is still read.
- A text file read still returns `{path, bytes, content}` with the content as the message.
- A PNG outside the root, or at a secret path in a non-ADMIN role session, is refused with no `image`.
- Fixture: `tests/files.plugins.test.ts` ("files-read image mode"), no network.
