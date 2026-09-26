---
change: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
artifact: testing
---

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
