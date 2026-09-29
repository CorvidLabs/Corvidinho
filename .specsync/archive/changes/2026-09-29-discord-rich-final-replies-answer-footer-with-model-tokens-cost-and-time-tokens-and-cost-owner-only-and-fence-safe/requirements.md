---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: requirements
---

# Requirements

- Added REQ-discord-075 (delta `deltas/discord.md`, DISCORD-16): a final
  answer over 2000 characters goes out as several messages of at most 2000
  characters on every answer path (chat, button-pick resume, `/work`,
  `/session start`, and their reply fallbacks), scrubbed before the split,
  never breaking a fenced code block, the role note whole in the last part,
  later parts pinging nobody, the footer and any button on the last part,
  every part continuing the session; long plain prose with no code or mention
  that fits one embed goes out as one embed; the Discord spawn client passes
  the whole answer and the run's `usage`; WATCH and schedule caps unchanged;
  gateway / slash content cap 2000.
- Modified REQ-discord-457 (delta, DISCORD-15 / 15.a / SAFE-14.a / SAFE-16):
  the answer footer is `model | [tokens | cost |] time | plumbing`; tokens and
  cost only on the owner's own runs, unknown never 0 / $0; everyone else sees
  model and time; the live status shows token use on owner runs only; the
  fallback reply carries the same footer on its last part; a re-edit keeps the
  first footer (time frozen). The bullet that pinned "no embed with neither a
  model nor plumbing" and "fallback unchanged" is replaced (an answer always
  carries its time now; the fallback reply carries the footer).
- Modified REQ-agent-073 (delta `deltas/agent.md`): `collectTaskRunStream`
  returns the last `usage` frame and takes an optional `bodyMax`;
  `chatBodyFromTaskResult` takes an optional `max` (default 1800, unchanged
  for WATCH / delegates).
- HI: DISCORD-15, DISCORD-15.a, DISCORD-16 (captured on the stacked base
  branch from Leif's 2026-09-28 interview), with SAFE-6, SAFE-14.a, SAFE-16,
  ROLES-CHAT-3, DISCORD-2, DISCORD-3 / 3.a, DISCORD-ASK-6/7 unchanged. No
  acceptance criteria beyond these captured ids.
