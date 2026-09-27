---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-457` | `tests/discord.thinking-status.test.ts` | "DISCORD-3.a footer-only embed on the collapsed answer": `finalizeContent` with model + plumbing edits `{ color: success, footer: { text: "gpt-test \| state=done verified=true attempts=1" } }` (no description, content unchanged); `failed` gives the error color and keeps `verifySkipped` / `attempts=3`; a second finalize (appended notice) repeats the same embed; a Choose stub with components stays `embed: null`; no model and no plumbing gives `null`. The first three fail with main's `thinking-status.ts` (embed `null`). |
| `REQ-discord-457` | `tests/discord.thinking-bridge.test.ts` | Through `startBridge`: the mention answer (task `done`, `verifySkipped`, `attempts=2`) carries `<model> \| state=done verified=false verifySkipped attempts=2` with no `state=` in the body and no `✅ Done` embed edit; a button pick: the Choose stub edit has `embed: null`, the resumed failed answer edited into the stub carries the red `<model> \| state=failed verified=false attempts=3`; the echo mention and failed-exit tests expect the model-only footer (green / red). All four fail with main's sources. |
| `REQ-discord-457` | `tests/discord.slash-ask7.test.ts` | `/session start` answer carries the model-only footer; new `/work` test: a failed, cancelled run's answer carries `<model> \| state=failed verified=false cancelled attempts=3` in red and the body has no `state=` / `attempts=`. Both fail with main's `slash-finish.ts` + `thinking-status.ts`. |
| `REQ-discord-047` / `REQ-discord-048` | `tests/discord.ask-ephemeral.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.inflight-replies.test.ts` | Choose stub still `embed: null` (unchanged test passes); collapsed clarify (green) / stuck (red) asks, the SAFE-8 warning answer and the in-flight collapse now expect the footer-only embed; one-message layout, pings and in-flight cleanup unchanged. |

## Automated coverage

- Fail-on-main proof: with `src/discord/{thinking-status,bridge,slash-finish}.ts` from `origin/main` swapped in, the six touched test files give 98 pass / 13 fail (every new or updated footer assertion); restored, 111 pass / 0 fail.
- `bun test tests/discord.thinking-status.test.ts tests/discord.thinking-bridge.test.ts tests/discord.slash-ask7.test.ts tests/discord.ask-ping.test.ts tests/discord.spend.test.ts tests/discord.inflight-replies.test.ts`
- Full suite: `bun test`; `bunx tsc --noEmit`; `fledge lanes run verify --non-interactive`.
