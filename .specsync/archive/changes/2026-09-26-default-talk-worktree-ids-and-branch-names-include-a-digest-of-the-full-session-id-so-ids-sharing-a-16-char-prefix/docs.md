---
change: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
artifact: docs
---

# Docs

`src/worktree/manager.ts` documents the new default name shape
(`talk-{prefix}-{digest}` / `talk/{prefix}-{digest}`) and why the prefix alone
collided. No user-facing docs change: branch names are opaque in Discord
replies and `/work` PR bodies, which print whatever name was stored.
