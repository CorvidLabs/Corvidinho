---
change: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
artifact: context
---

# Context

Issue #11 (DISCORD-4): slash commands let the operator manage sessions, see
agents, check status, and drive work tasks without leaving Discord.

Confirmed HI: `hi/discord.md` DISCORD-4. Ancestor steal (consult only):
CorvidLabs/corvid-agent `server/discord/commands.ts`,
`command-handlers/session-commands.ts`, `info-commands.ts`, `work-dispatch.ts`.

Depends on HEAR thin + thinking (#5/#10 → #23/#25): gateway, SessionStore,
AgentClient, ThinkingStatus. No ProcessManager, no WorkTaskService DB, no voice,
no iced UI, no council/marketplace admin.

Thin useful set matching team preference: `/session` (list/start), `/status`,
`/agents`, `/work` — handler dispatch map shape from ancestor; in-memory work
stubs + existing session store. Allowlists stay default-deny; re-check channel
at handler time (DISCORD-5 / DISCORD-7 light). Fixture tests, no live token.

Update STATUS.md Done when this slice merges (#11 → this PR).
