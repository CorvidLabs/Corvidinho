---
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
artifact: requirements
---

# Requirements

1. On Discord `ClientReady` (login and restart), set bot presence/activity to a short version string from shared `src/version.ts` / package.json (same source as `/status`).
2. Prefer `ActivityType.Custom` (custom status) with state like `v0.0.3`; keep string short; no extra chrome.
3. Pure helper builds the presence payload for fixture tests without a live Discord token.
4. Slash command registration and channel/user/role allowlists unchanged.
5. Capture HI DISCORD-12; STATUS.md notes the presence version slice.
6. SpecSync delta REQ-discord-017 + fledge verify green.
