---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: context
---

# Context

Issue #75 (M2 "Talk anywhere"). Captured HI (`hi/discord.md`, captured on the
stacked base `claude/hi-capture-interview-2026-09-28` from Leif's 2026-09-28
interview; not captured again here):

- **DISCORD-15** "Every answer carries a small footer with model, tokens, cost
  and time; a cost it doesn't know shows as unknown, never $0."
- **DISCORD-15.a** "Tokens and cost show only in my own runs' footers;
  everyone else sees model and time."
- **DISCORD-16** "Long answers are split at Discord's 2000-character limit
  without breaking code fences, using embeds where they read better than plain
  text."

Related captured criteria that still hold: SAFE-14.a (only the owner sees
spend amounts), SAFE-16 (an unknown price shows as unknown, never free),
SAFE-6 (scrub), ROLES-CHAT-3 (closing role note), DISCORD-3 / DISCORD-3.a
(live status, plumbing in the footer), DISCORD-ASK-6/7 (collapse into one
message), AGENT-6 / DISCORD-2 (reply continuity).

Gap on the base (d589638): the collapsed answer's footer (#260, REQ-discord-457)
is `model | state=… verified=… attempts=…` only (no tokens, cost or time);
the live thinking status shows `~tok` to everyone; chat bodies are cut to
1800 characters (`chatBodyFromTaskResult`, then `result.summary.slice(0,
1800)` in the bridge and `slice(0, 1500)` in `/work` / `/session start`),
so an answer past that is silently truncated, often mid code block; the
gateway slices every post at 1900.

Constraints: reuse the SAFE-8 price table (`priceForModel`, `costMicroUsd`,
`formatUsd`), the owner check (`isOwnerDiscord`, ADMIN is owner-only), the
scrubber, the role-note helpers and the existing collapse / fallback paths; no
new env var, config key, slash command, schema or protocol change. WATCH
comments and schedule posts keep their own caps. #232 / #233 are landed
separately and are out of scope. Specs change only through this SpecSync
change.
