---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: testing
---

# Testing

Fixture tests only: a temp allowlist file (the owner and a declared person
with Discord and GitHub ids) and a temp data dir; `runPlugin` with
Discord-conversation, schedule, GitHub-shaped and local-CLI env;
`createTaskExecute` with a fake LLM fetch; the real `task run` spawned by
the Discord agent client against a local fake LLM server; `startBridge`
with a fake gateway (reply, `sendDm`) and an injected agent; the
`/session start` and `/work` handlers with a recording outbound. No
Discord, no GitHub, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-710` | `tests/memory.private-view.test.ts` ("memory plugins: a private read rides privateText …") | In a Discord conversation Tofu's own private notes and profile, and the owner's `--person` recall (id), `--person` profile (Discord id) and `--person` private notes each return the content only in `privateText`; `data` is `{ sentPrivately: true, what }`, `message` the placeholder, neither holds `TOFU-TZ-SECRET` / `TOFU-PRIVATE-SECRET`; the profile text counts private notes only; Tofu's own `--query editor` recall still returns the row. A schedule refuses the owner's `--person` view and profile and Tofu's own profile (MEMORY-7.a, no content); a GitHub declared commenter's `memory-profile` is refused ("never in a GitHub thread") while their recall works; the local CLI shows the profile inline with no `privateText`. |
| `REQ-plugins-710` / `REQ-plugins-101` / `REQ-plugins-067` | `tests/memory.profiles.test.ts`, `tests/memory.recall-github.test.ts` (updated) | The profile, role, owner-view and private-notes tests now read `privateText` (and the structured profile from the local CLI); the GitHub test expects `memory-profile` refused with no content; every other ACL / privacy assertion unchanged. |
| `REQ-agent-710` | `tests/memory.private-view.test.ts` ("the tool loop keeps private text from the model") | The model calls `memory-profile` then `memory-recall --category private`: `onPrivateReply` gets both texts, none of the three request bodies, no event and the result holds either secret, the third request carries "sent privately (MEMORY-7.a)", both ToolResult events succeed; the prompt names the rule and that profiles are never read on GitHub. |
| `REQ-cli-710` / `REQ-discord-710` | `tests/memory.private-view.test.ts` ("task run → result frame → the Discord agent client") | End to end: `createSpawnAgentClient` runs the real `src/cli.ts task run --output ndjson` as Tofu in a conversation against a local fake LLM; `privateReplies` holds the profile and the private notes, the summary and every request body the LLM server saw lack them. `privateRepliesFromUnknown` keeps non-empty strings, at most 5, each cut to 6000. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("delivery helpers") | `deliverPrivateReplies`: none ⇒ null; a long text with a GitHub token ⇒ several DMs to the user, each ≤1900, scrubbed, the first starting with the header ⇒ "sent"; no `sendDm`, a null send or a throwing send ⇒ "failed"; `withPrivateNote` puts the note on top, none unchanged. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("the bridge shows it only privately, by DM") | Chat: one DM to the author with the text; the channel (replies, embeds, content edits) carries the sent note and the model's answer, never the text; the session thread never holds it; with the DM failing the channel carries the "couldn't DM it" note and the text is nowhere. A button pick (Choose ask) and an Answer form submit resume DM the presser / submitter with the note in the channel. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("/session start and /work show it only privately, by DM") | Each handler DMs the invoker through `SlashContext.sendDm`; the collapsed answer and the deferred reply carry the sent note and never the text, nor does the session thread; without `sendDm` the "couldn't DM it" note and no text. |

Fail on main: with main's sources (20a0f58) swapped in for the changed files
(`plugins/memory/commands.ts`, `src/plugins/types.ts`,
`src/agent/execute.ts`, `src/agent/types.ts`, `src/cli.ts`,
`src/discord/agent-client.ts`, `src/discord/types.ts`,
`src/discord/bridge.ts`, `src/discord/slash-types.ts`,
`src/discord/command-handlers/session.ts` and `work.ts`) and
`src/discord/private-reply.ts` removed, `tests/memory.private-view.test.ts`
fails 15 of 16 on its assertions (the one that passes is the unchanged
local-CLI guard, by design) and the updated `tests/memory.profiles.test.ts`
/ `tests/memory.recall-github.test.ts` fail 5 of 35 (the five assertions
this change turns around). Restored, all 51 pass.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.
