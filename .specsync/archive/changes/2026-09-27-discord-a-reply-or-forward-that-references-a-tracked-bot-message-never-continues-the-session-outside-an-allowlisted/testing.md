---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: testing
---

# Testing

Regression test: `tests/discord.forward-channel.test.ts` (20 tests after the
review follow-up). It
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

- Review follow-up (ask buttons): 8 more tests. With the bridge's
  `onComponent` as on main (no channel gate), 3 of them fail: a press from a
  non-allowlisted channel resumes the session, a press after the session's
  channel left the allowlist resumes it and the run posts there, and an
  admin's press outside the allowlist resumes instead of getting the tip.
  With the gate, all 20 pass. A press in the allowlisted channel and in the
  session's thread under an allowlisted parent still resume.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-212` | `tests/discord.forward-channel.test.ts` | Bridge: the owner @mentions in `chan-on` (agent runs once, progress message tracked), then sends two messages in `chan-off` referencing that tracked message (with and without @mention): the agent is not spawned again and nothing is sent, edited or deleted in `chan-off`; a reply in `chan-on` to the same message continues the same session (agent runs, one session). Router: a reference from `chan-off` returns silent `ignore`/`refuse` (`channel_not_allowlisted`, no reply) and creates no session; a thread under a non-allowlisted parent does not continue an allowlisted session; a same-channel reply and a thread under an allowlisted parent continue. Gateway: `replyReferenceMessageId` drops `MessageReferenceType.Forward` and other-channel references, keeps a same-channel reply (default or missing type) and a thread/parent reference; `REFERENCE_TYPE_FORWARD` equals `discord.js` `MessageReferenceType.Forward`. Ask buttons: a press from `chan-off`, or in `chan-on` after it left the allowlist, gets only the zero-width ephemeral ack (the allowlist tip for the owner/admin), the ask stays pending, the agent is not run and nothing is sent or edited; a press in `chan-on` or in the session's thread under `chan-on` resumes; `componentChannelAllowlisted` checks the press channel, the session's thread under an allowlisted parent, and a deny-listed session channel. |
