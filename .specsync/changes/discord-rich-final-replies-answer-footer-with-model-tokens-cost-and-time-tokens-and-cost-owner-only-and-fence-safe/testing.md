---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: testing
---

# Testing

Fixture tests only: `startBridge` with a null gateway, in-memory thinking
outbound, injected agents and fake slash / component interactions; fake-bin
spawn clients; the live gateway with its socket connect stubbed. No live
Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (chat) | A 5066-character answer with a code block across the 2000 mark: the first part is edited into the thinking message, the rest are fresh `sendMessage` posts; every part ≤ 2000 with balanced fences; all lines kept in order; the footer (`model \| Ns`, non-owner) only on the last part; no fallback reply; each part's id maps to the session. Long plain prose → one embed (description = the answer, footer), no posts. The role note ends the last part and no earlier part carries it. Without `editMessage` the fallback reply is split the same way: first part replies to the request, later parts reply to nothing with `mentionUserIds: []`, footer on the last. A split fallback reply with a SAFE-8 80% warning (owner configured): the warning line holding `<@owner>` lands in a later part, that part carries `mentionUserIds: [owner]` and every other later part `[]` (review fix: the owner was pre-marked as pinged by the first part, which held no mention of them, so the owner was never pinged). A button-pick resume's long answer is split into the stub the same way. |
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (`/work`, `/session start`) | `/work` (owner) collapsed answer: header + answer split, every part ≤ 2000 with balanced fences, answer lines kept, footer `model \| tokens unknown \| cost unknown \| Ns` only on the last posted part. `/session start` without `editMessage`: the deferred reply holds part one, `ctx.post` posts the rest with `mentionUserIds: []`, footer on the last. |
| `REQ-discord-075` / `REQ-agent-073` | `tests/discord.rich-replies.test.ts` (spawn clients) | Fake bin streaming a `usage` frame and a 3829-character result: the Discord client returns the summary uncut and `usage` `{1200, 300, 1500}`; the WATCH client returns the same summary cut at 1800 (guard, passes on base too). |
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (live gateway) | `handlers.reply` with a 2000-character part and an embed sends all 2000 characters and the embed (base: cut to 1900, no embed). |
| `REQ-discord-075` | `tests/discord.rich-reply.unit.test.ts` | `splitDiscordMessage`: ≤ 2000 unchanged; prose split on line breaks, joined back exactly; a long block closed at a part end and reopened with `ts`; a block that fits moves whole to the next part; an open fence at the end closed; a long line cut at spaces (`join(" ")` restores it); no lone surrogate at a hard cut; the role note whole in the last part (or the last part itself; after an open block, closed first). `planAnswerParts`: short → one message with the footer; a token across char 2000 is redacted before the split; long prose → one embed; code / mention / not allowed → split, footer on the last. `planAnswerParts` cuts a text over `DISCORD_ANSWER_MAX` to it (`…`, role note kept, every part ≤ 2000). `postAnswerParts`: first part replies with the answer's mentions, later parts reply to nothing and allow only a listed user first mentioned in them (the owner line in the last part pings the owner; a mention already in the skipped first part is not pinged again), footer on the last; a failed first post → null. |
| `REQ-discord-457` | `tests/discord.rich-replies.test.ts` (footer) | Owner run with usage `{1000, 500, 1500}`: footer `model \| 2k tokens \| <priced cost> \| Ns`. Owner run without usage: `model \| tokens unknown \| cost unknown \| Ns`, no `$0`. Non-owner run with usage: `model \| Ns`, no `token`, no `$`. Live status: a non-owner run's footers never show `tok`; the owner's show `~250 tok`. |
| `REQ-discord-457` | `tests/discord.rich-reply.unit.test.ts`, `tests/discord.thinking-status.test.ts` | `answerSpendFor`: priced model → tokens and cost > 0; unpriced → tokens only; no usage / zero tokens → nothing. `formatAnswerFooter`: owner order `model \| tokens \| cost \| time \| plumbing`; unknown words, never `$0`; without spend model and time only. `finalizeContent` (fixed clock): `gpt-test \| 0s \| <plumbing>`, error color when failed, a re-edit keeps the same footer, a Choose stub has none, with nothing else known the footer is the time. |
| `REQ-discord-457` | `tests/discord.thinking-bridge.test.ts`, `tests/discord.slash-ask7.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.inflight-replies.test.ts` | Existing collapse assertions now expect the time segment (`model \| Ns [\| plumbing]`); the `/session start` and `/work` owner runs expect `tokens unknown \| cost unknown`. |

Fail-on-base proof: with the base's `src/` (d589638) swapped in and
`src/discord/rich-reply.ts` removed, `tests/discord.rich-replies.test.ts`
ran 13 fail / 1 pass (the WATCH 1800-cap guard); restored, 14 pass. The
review's added owner-ping case fails on the base (no split) and on the
pre-fix branch module (owner not allowed on the part with the warning); the
unit cap and ping cases fail on the pre-fix module; all pass with the fix
(15 + 18). The unit
file cannot load on the base (no `rich-reply.ts`).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `hi check` green;
`fledge lanes run verify --non-interactive` completed.
