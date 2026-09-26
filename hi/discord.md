---
hi: 1
families: [DISCORD]
owner: leif
---

# Discord

## Intent

Discord is how I talk to the agent while I am not in a terminal. Mentions become sessions, replies continue them, and slash commands cover the boring ops. It is a bridge into Corvidinho, not a token-gating product and not a second brain with different rules.

## Criteria

- **DISCORD-1**  I can @ the bot in an allowed channel and it starts a real agent session on my Linux host, not a toy reply bot.
- **DISCORD-2**  If I reply to one of its messages, the same session continues without me hunting for an id.
  - **DISCORD-2.a**  Inside a thread it keeps one session for that thread so the conversation stays coherent.
- **DISCORD-3**  While it thinks I see a live status (time, current tool, rough token use) instead of a silent void.
- **DISCORD-4**  Slash commands let me manage sessions, see agents, check status, and drive work tasks without leaving Discord.
- **DISCORD-5**  It only listens and posts in channels I allowlisted. Outside those channels (or from a non-configured user when a user allowlist applies), refuse means: silent for non-admins, ephemeral allowlist tip for admins on slash — never a public "not authorized" leak. See DISCORD-DENY-1..3.
- **DISCORD-6**  Rate limits and mutes stop one user from melting the box, without punishing everyone else.
- **DISCORD-7**  Admin-shaped commands are checked again when they run, even if Discord’s UI later showed them to the wrong people.
- **DISCORD-8**  If the agent tries to post to another channel on my behalf, the bridge checks that *I* could have posted there, not only that the bot could.
- **DISCORD-9**  Images I attach are available to the agent as files it can actually look at.
- **DISCORD-10**  If the bridge and the agent binary disagree on protocol version, the bridge refuses to start rather than misparsing quiet failure.
- **DISCORD-12**  Under the bot name I always see the Corvidinho version (same shared version as /status) as a short Discord presence or custom status so I can tell which build is live at a glance.
- **DISCORD-DENY-1**  If a message or slash arrives outside an allowlisted channel (or from a non-configured user where user allowlist applies), Corvidinho does not send any public channel reply.
- **DISCORD-DENY-2**  If the actor is an admin (existing admin allowlist / ADMIN HI), reply ephemeral only with a short tip: how to add the channel (or user) to the Discord allowlist config — no public leak. MessageCreate has no ephemeral, so MessageCreate stays silent for admins too (tip is slash/interaction only).
- **DISCORD-DENY-3**  Non-admins get zero response (no DM, no public message, no reaction). Slash interactions still require a Discord ack within 3s: use ephemeral zero-width (or defer+delete) so only the invoker briefly sees nothing useful — document the choice; never leak allowlist guidance to non-admins.

## Notes (not numbered AC)

- Mermaid diagrams stay in **repo docs** (e.g. `docs/discord.md`). Discord chat uses embeds, code fences, or PNG — not native Mermaid.

## Retired

- **DISCORD-11**  --help
  retired: Accidental capture of CLI --help text; unused. Real presence criterion is DISCORD-12.
