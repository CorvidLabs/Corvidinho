# Lesson bundle — discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord deny polish (DISCORD-DENY-1..3): MessageCreate unauthorized silent; slash admin ephemeral allowlist tip, non-admin ephemeral zero-width ack; docs/discord.md with slash inventory + deny mermaid flowchart; no public not-authorized leaks
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/message-router.ts, src/discord/slash-dispatch.ts, src/discord/types.ts, tests/discord.router.test.ts, tests/discord.slash.test.ts, docs/discord.md, hi/discord.md, STATUS.md, README.md, AGENTS.md
- **Acceptance**: MessageCreate outside allowlist never public-replies (silent for all); slash outside allowlist: admin gets ephemeral allowlist tip, non-admin gets ephemeral zero-width ack only (Discord 3s rule); no public not-authorized; docs/discord.md covers 6 slash cmds, outbound formats, deny mermaid flowchart, mermaid-docs-only note; links from STATUS/AGENTS/README/hi/discord; fixture tests for router+slash deny; SpecSync+fledge verify green

## Evidence

- Verification commit: `d1505eb4bc356bd5f373fb6639c03c0eef05238e`
- Base commit: `261fe6a9cb5028b2c4250eaee15ad259b6353057`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif confirmed Discord deny polish: outside allowlisted channels (or non-configured
users when a user allowlist applies), Corvidinho must not leak public "not
authorized" replies. Today `message-router.ts` returns `reply: NOT_AUTHORIZED` on
@mention in a non-allowlisted channel (bridge posts publicly), and slash-dispatch
always replies ephemeral "not authorized" even for non-admins.

Confirmed HI (2026-09-26): DISCORD-DENY-1..3 + amend DISCORD-5. Captured in
`hi/discord.md` commit before this SpecSync change. Mermaid stays in repo docs;
Discord chat uses embeds/fences/PNG.

Constraints: HI-first; do not invent extra deny cases; MessageCreate has no
ephemeral → silent for all on message deny; slash must ack within 3s → admin
ephemeral tip, non-admin ephemeral zero-width; Linux-only; SpecSync + fledge
verify green; no MEMORY/#35 nesting.

## From the change's design.md

# Design

## MessageCreate (gateway messages)

`routeMessage` on allowlist gate fail:
- With or without @mention → `{ kind: "refuse", reason: "channel_not_allowlisted" }`
  **without** `reply` (bridge only posts when `action.reply` is set).
- Same for thread/reply continue paths that fail channel re-check.
- Admin tip is NOT available on MessageCreate (no ephemeral) → silent for admins too.

## Slash interactions

On `gateChannel` fail:
1. `resolvePermissionLevel({ userId, roleIds, allowlist, adminUserIds, adminRoleIds, mutedUsers })`
2. If `>= ADMIN` → `interaction.reply({ ephemeral: true, content: ALLOWLIST_DENY_TIP })`
3. Else → `interaction.reply({ ephemeral: true, content: EPHEMERAL_SILENT_ACK })`
   where `EPHEMERAL_SILENT_ACK = "\u200b"` (zero-width space). Discord requires a
   response within 3s; true zero/public silence is impossible for interactions.
   Documented compromise for DISCORD-DENY-3.

Tip (~example): "This channel isn’t allowlisted. Add its id to discord.channels
in ~/.config/corvidinho/allowlist.toml (or CORVIDINHO_DISCORD_CHANNELS /
DISCORD_CHANNEL_IDS) and restart the bridge."

## Docs mermaid

Deny flowchart lives only in `docs/discord.md`. Discord UX never posts mermaid.

## From the change's testing.md

# Testing

- Router: @mention non-allowlisted → refuse with no reply; no-mention → ignore;
  empty channels → refuse no reply.
- Slash: non-allowlisted non-admin → ok:false, ephemeral `\u200b` (or empty-useful),
  no tip text; admin → ephemeral ALLOWLIST_DENY_TIP.
- No live Discord token.
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-018 | `tests/discord.router.test.ts` + `tests/discord.slash.test.ts` deny paths |

## Automated coverage

- `bun test tests/discord.router.test.ts tests/discord.slash.test.ts tests/discord.admin-reauth.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
