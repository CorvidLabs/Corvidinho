# Lesson bundle — the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: The collapsed final answer keeps a footer-only embed with the model and state/verified/verifySkipped/attempts, while the Choose stub stays embed-free (DISCORD-3.a)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/thinking-status.ts, src/discord/bridge.ts, src/discord/slash-finish.ts, tests/discord.thinking-status.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.slash-ask7.test.ts, tests/discord.spend.test.ts, tests/discord.inflight-replies.test.ts, tests/discord.ask-ping.test.ts, docs/discord.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: When the thinking message is edited into the final answer (an @mention reply, the answer to a run a button pick resumed, /session start and /work), the edit keeps one footer-only embed (no description) whose footer is the model and the run's plumbing (state=… verified=… [verifySkipped] [cancelled] attempts=…), success-colored or error-colored exactly when the fallback status would be done or fail, and the answer body stays human text with no plumbing; a Choose stub (the edit that carries buttons) still has no embed; an append re-edit (SAFE-8 owner notice) keeps the footer; with neither model nor plumbing known no embed is sent; tests fail on the previous code (embed null on every collapse) and pass after

## Evidence

- Verification commit: `54cae1620eccdda55284356c0f4216bc154bd6ea`
- Base commit: `0940db343de30fdb4d79d83cfa44b95c5a247681`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

DISCORD-3.a (`hi/discord.md`, captured): "Thinking/progress embed shows
model name and useful status (session id OK); state/verified/verifySkipped/attempts
live in the embed footer or description, never in the final chat reply body".

Gap on main (0940db3): `ThinkingStatus.buildThinkingFooter` appends the
plumbing only in the done/error phase, and `finalizeContent` (DISCORD-ASK-6/7)
edits the thinking message into the answer with `embed: null` without a
done/error flush. On the normal path (`editMessage` available: every live
gateway) the plumbing the bridge computes (`formatTaskPlumbing`) and the model
were shown nowhere; they appeared only on the fallback `done()`/`fail()`
path when the collapse edit was unavailable or failed. `docs/discord.md` said
the plumbing line shows "on done/error". Same for `/session start` and `/work`
(`finishSlashWithThinking`) and for the answer a button pick resumed.

Constraints: DISCORD-ASK-6 / REQ-discord-047 keep the Choose stub embed-free;
DISCORD-ASK-7 keeps one public message (a message can carry content and an
embed together). No new env vars, config keys, slash commands or schema bump.
Not the draft DISCORD-15/16 footer of issue #75 (tokens, cost, time): nothing
beyond the captured model + plumbing is shown.

## From the change's design.md

# Design

- `src/discord/thinking-status.ts`: new `buildAnswerFooterEmbed({ phase,
  model, plumbing })` returns `{ color: phaseColor(phase), footer: { text:
  "model | plumbing" } }` (segments that are unknown are left out; no
  description), or null when neither is known. `DiscordEmbedPayload.description`
  becomes optional; the gateway already maps embeds as raw objects, so an
  undefined description is simply not sent.
- `ThinkingStatus.finalizeContent` takes optional `extras` (`plumbing`,
  `model`, same shape as `done()`/`fail()`) and `failed`. It stores them,
  then edits with `embed: null` when `components` is non-empty (the Choose
  stub, DISCORD-ASK-6) and with the footer-only embed otherwise. The phase
  (done/error) is kept after a successful edit, so a later re-edit (the SAFE-8
  owner notice appended by `finishSlashWithOwnerNotice`) keeps the same footer
  and color without the caller passing them again.
- Callers pass what they already pass to the fallback: `bridge.ts` chat and
  button-pick paths pass `thinkExtras` and `failed: askBody ? askBody.failed :
  !result.ok`; `finishSlashWithThinking` passes `opts.thinkExtras` and
  `failed: askStatus ? askStatus.failed : !ok`. So the collapsed answer's color
  matches the done/error status the fallback would have shown.
- The rule "no footer on a Choose stub" lives in `finalizeContent`
  (components present), so any future caller that collapses into a button
  stub gets the DISCORD-ASK-6 layout without extra wiring.
- Fallback path (`done()`/`fail()` + separate reply) unchanged.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
