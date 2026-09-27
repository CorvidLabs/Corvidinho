---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: testing
---

# Testing

Regression test: `tests/discord.forward-channel.test.ts` (12 tests). It
covers the router (own-channel gate), the gateway reference helper, and the
bridge end to end (dry run, injected agent client, memory thinking outbound,
channel allowlist `chan-on`).

- Before the fix (origin/main `dc65cf7`): the file fails (`SyntaxError:
  Export named 'REFERENCE_TYPE_FORWARD' not found`, 0 pass / 1 fail). With a
  shim that keeps main's gateway behavior (`reference.messageId` taken as is),
  7 of 12 fail: the router returns `continue_session` for a message in
  `chan-off`, the gateway keeps forward and other-channel references, and the
  bridge runs the agent 3 times with 4 posts/edits in `chan-off`.
- Gateway fix alone (router unfixed): 3 of 12 still fail (router + bridge
  cases), so the router gate is needed on its own.
- After the fix: 12 pass, 0 fail. Existing router, actor-gate, rate/mute,
  thin-ack, spend and thread tests pass unchanged (`bun test tests/discord.*`:
  353 pass, 0 fail, this file included).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-212` | `tests/discord.forward-channel.test.ts` | Bridge: the owner @mentions in `chan-on` (agent runs once, progress message tracked), then sends two messages in `chan-off` referencing that tracked message (with and without @mention): the agent is not spawned again and nothing is sent, edited or deleted in `chan-off`; a reply in `chan-on` to the same message continues the same session (agent runs, one session). Router: a reference from `chan-off` returns silent `ignore`/`refuse` (`channel_not_allowlisted`, no reply) and creates no session; a thread under a non-allowlisted parent does not continue an allowlisted session; a same-channel reply and a thread under an allowlisted parent continue. Gateway: `replyReferenceMessageId` drops `MessageReferenceType.Forward` and other-channel references, keeps a same-channel reply (default or missing type) and a thread/parent reference; `REFERENCE_TYPE_FORWARD` equals `discord.js` `MessageReferenceType.Forward`. |
