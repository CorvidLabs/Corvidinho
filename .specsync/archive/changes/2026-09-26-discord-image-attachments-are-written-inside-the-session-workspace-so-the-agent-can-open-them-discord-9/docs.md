---
change: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: the Invariants line now says attachments
  live in `<cwd>/.corvidinho/attachments/` (git-ignored, removed on session
  end) instead of `/tmp/corvidinho-images`; Public API names
  `attachmentCacheDir` / `WORKSPACE_ATTACHMENTS_SUBDIR` and the bind-first
  order in the bridge.
- `src/discord/image-attachments.ts`: module and `IMAGE_CACHE_DIR` comments
  say the `/tmp` dir is only a fallback the bridge does not use.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
