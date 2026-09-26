---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: plan
---

# Plan

1. Capture HI into hi/discord.md and hi/session.md.
2. Extend HumanAsk with options; ask-human tool + ask-options parse.
3. ask-buttons module: custom ids, stub/ephemeral format, TTL.
4. Gateway: components on reply + MessageComponent handler.
5. Bridge: post stub when options; onComponent open/pick/expire; keep button
   pending across chat turns; free-text path unchanged.
6. Router/session-store: per-user session keying and ownership checks.
7. Specs REQ-discord-044 amend + 045/046; REQ-agent-045; tests; package 0.0.22.

