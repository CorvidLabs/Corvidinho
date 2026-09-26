# Lesson bundle — dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Dogfood UX: Discord identity inject (IDENTITY-4), thinking embed model+plumbing (DISCORD-3.a), clean chat replies, community public GitHub gate (ROLES-CHAT-8); package 0.0.18
- **Kind**: BugFix
- **Specs**: discord, agent, plugins
- **Paths**: src/discord/identity-inject.ts, src/discord/thinking-status.ts, src/discord/bridge.ts, src/discord/gateway.ts, src/discord/types.ts, src/discord/slash-types.ts, src/discord/agent-client.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/agent/task-summary.ts, src/agent/events-ndjson.ts, src/agent/execute.ts, src/plugins/githubPublic.ts, plugins/github/commands.ts, plugins/github/review.ts, plugins/files/protectedPaths.ts, plugins/files/commands.ts, tests/discord.identity-inject.test.ts, tests/github.public.community.test.ts, tests/files.secret-path.test.ts
- **Acceptance**: IDENTITY-4: Discord injects acting user id + display (owner map wins for owner; never invents names like Kyn); memory stays scoped to acting user. DISCORD-3.a: thinking embed shows model + session + state/verified/verifySkipped/attempts in footer; final Discord chat reply is human text only with no plumbing lines. ROLES-CHAT-8: non-ADMIN community sessions may use any public GitHub (+ site/roadmap via web-fetch); private repos and secret paths (.env/keys) refused; deny lists still win; ADMIN keeps GITHUB-6 allowlist. Package 0.0.18; fixture tests green.

## Evidence

- Verification commit: `bbd506d0fcea89e89835df646b09387b4178871f`
- Base commit: `65cff62fdae8cb0413d92adfe8acb29455fc127f`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Leif dogfood on Discord (owner id 181969874455756800):

1. Bot called him "Kyn" on first reply — model guessed a name instead of using Discord user id / owner display.
2. Final chat replies leaked plumbing: `state=done verified=false verifySkipped attempts=1`.
3. Thinking embed should show model + useful status; plumbing belongs in the embed, not the chat body.
4. Public-channel Q&A: answer from any public GitHub + site/roadmap; never private repos or secrets (confirmed ROLES-CHAT-8).

HI captured thin: IDENTITY-4, DISCORD-3.a, ROLES-CHAT-8.

## From the change's design.md

# Design

- `identity-inject.ts`: format/enrich prompt with Discord id + resolved display; gateway fills authorDisplayName/username; bridge + slash wire before memory inject.
- `task-summary.ts`: split `formatTaskPlumbing` vs `chatBodyFromTaskResult`; NDJSON collector / Discord summary use chat body only.
- `ThinkingStatus`: optional `model` + `plumbing` on snapshot/footer; `done`/`fail` accept extras.
- `githubPublic.ts` `checkRepoGateForActingRole`: community → Octokit visibility (injectable); public allow; private/unknown refuse; deny wins; ADMIN → existing allowlist.
- `isSecretPath` + files-read refuse for non-ADMIN role sessions.
- System prompt: IDENTITY + PUBLIC_QA instruction blocks.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| IDENTITY-4 | `tests/discord.identity-inject.test.ts` | Owner display wins; no invented names; inject block has id + display. |
| DISCORD-3.a | `tests/spawn.argv.test.ts`, `tests/discord.thinking-status.test.ts`, `tests/agent.ndjson-spawn.test.ts`, `tests/agent.events-ndjson.test.ts` | Chat body has no `state=`; footer carries plumbing + model. |
| ROLES-CHAT-8 | `tests/github.public.community.test.ts`, `tests/files.secret-path.test.ts` | Community public allow / private refuse; deny wins; secret paths flagged. |

## Automated coverage

- `bun test tests/discord.identity-inject.test.ts tests/discord.thinking-status.test.ts tests/spawn.argv.test.ts tests/github.public.community.test.ts tests/files.secret-path.test.ts tests/agent.ndjson-spawn.test.ts tests/agent.events-ndjson.test.ts`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
- `specs/plugins/context.md`
