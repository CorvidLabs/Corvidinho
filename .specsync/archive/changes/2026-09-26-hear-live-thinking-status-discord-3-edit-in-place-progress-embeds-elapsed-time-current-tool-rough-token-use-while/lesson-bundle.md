# Lesson bundle — hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: HEAR live thinking status DISCORD-3: edit-in-place progress embeds (elapsed time, current tool, rough token use) while session runs; steal corvid-agent progress-response/embeds patterns; no ProcessManager; fixture tests; STATUS Done refresh for HEAR thin #5→#23 and attribution #20→#24
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, tests, STATUS.md
- **Acceptance**: On start/continue session the bridge posts one progress embed (not silent void); edits it in-place with elapsed time and optional current tool / rough token use while agent runs; marks Done (or error) when complete then posts final reply; no ProcessManager; allowlists unchanged (default-deny); fixture/unit tests without live Discord token; STATUS Done lists HEAR thin #5→#23 and attribution #20→#24; SpecSync + fledge verify green

## Evidence

- Verification commit: `c0bdab1e8d5754bc74eb3d849969c1953a67da57`
- Base commit: `f987ded8770b32beffa2ed0a3c96b0ce0bc30906`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #10 (DISCORD-3): while the agent thinks, Discord should show a live status
(elapsed time, current tool, rough token use) instead of a silent void.

Confirmed HI: `hi/discord.md` DISCORD-3. Ancestor: CorvidLabs/corvid-agent
`progress-response.ts` / `embeds.ts` (edit-in-place progress embed).

Depends on HEAR thin (#5 → PR #23): gateway → message-router → session stub.
Thin HEAR has no ProcessManager; chat spawn is opaque `runChat`. Steal the UX
shape (one progress message edited in-channel), not ProcessManager subscriptions.

Out of scope: iced UI, Telegram, token-gating product UI, slash commands (#11+),
weakening allowlists.

Also refresh STATUS.md Done table: HEAR thin #5→#23 and attribution #20→#24
already on main tip.

## From the change's testing.md

# Testing

- Unit: formatElapsed, footer with tool/tokens, embed phase colors.
- Unit: ThinkingStatus start→update→done records send then edits (mock outbound).
- Bridge: injected gateway + echo agent → progress message posted before
  final reply; Done edit after agent returns; failure marks error.
- No live Discord token. Existing router/allowlist tests remain green.
- Gate: `bun test`, `bunx tsc --noEmit`, `specsync check`, fledge verify.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-008 | `tests/discord.thinking-status.test.ts` builders/footer/elapsed/tokens; `tests/discord.thinking-bridge.test.ts` progress send→Done/error then final reply |

## Automated coverage

- `bun test tests/discord.thinking-status.test.ts tests/discord.thinking-bridge.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
