---
module: discord
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
---

# Delta — discord (an attached image opened with files-read reaches the model as an image part)

## Modified

### REQUIREMENT REQ-discord-013

The bridge SHALL make Discord image attachments available to the agent as
local files it can look at (DISCORD-9). Steal shape from corvid-agent
`image-attachments.ts`: MIME allowlist jpeg/png/gif/webp, 20MB size cap, max
5 images per message; download at receive time; multimodal blocks + URL
fallback. Merlin localPath: the bridge SHALL bind the session workspace first
and then write the files inside the directory the agent runs in
(`<session cwd>/.corvidinho/attachments/`, via
`attachmentCacheDir(store.cwdFor(session))`), never under a shared `/tmp`
dir, and SHALL include those paths in the agent prompt via
`enrichPromptWithImages`, so the agent's `files-read` (which refuses paths
outside its cwd) can open them; `files-read` SHALL hand the model the image
itself as an image part, not decoded bytes (REQ-plugins-427 /
REQ-agent-428). The attachment dir SHALL carry a self-ignoring `.gitignore`
so images never land in a commit, and SHALL be removed with the workspace
when the session ends or expires
(SESSION-WORKTREE-3). Non-image / oversized / failed downloads SHALL be
skipped with a notice. The bridge SHALL NOT introduce ProcessManager or
weaken allowlists. Fixture tests SHALL cover extraction and localPath without
a live Discord token or live CDN.

Acceptance Criteria
- Supported image → downloaded + localPath under cache dir; prompt cites path.
- Bridge: the cited path is under `<session cwd>/.corvidinho/attachments/`;
  opening the cited path with `files-read` (with that cwd) gives the model the
  image itself (an image part: `mediaType` `image/png`, base64 that
  round-trips to the downloaded bytes), not decoded bytes; `git status` in the
  talk worktree stays clean; ending the session deletes the file.
- Unsupported MIME / oversize / over-5 → skipped; peers unaffected.
- Fixture tests for appendAttachmentUrls / buildMultimodalContent /
  enrichPromptWithImages; no live token; secrets out of repo; default-deny.
