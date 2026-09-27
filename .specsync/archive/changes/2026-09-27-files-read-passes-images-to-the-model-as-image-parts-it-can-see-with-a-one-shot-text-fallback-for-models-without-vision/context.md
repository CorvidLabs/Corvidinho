---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: context
---

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
