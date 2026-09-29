---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: requirements
---

# Requirements

- Added **REQ-plugins-710** (delta `deltas/plugins.md`): in a Discord
  conversation a private read (private notes, the owner's `--person` view,
  `memory-profile`) returns its text only in `privateText` with a
  placeholder `data` / `message`; refused in a schedule and in a GitHub
  thread (`memory-profile` included); the local CLI unchanged. Narrows
  REQ-plugins-067 (a declared commenter's `memory-profile` on GitHub) and
  REQ-plugins-101 (the conversation returns them privately); every other rule
  of both stands.
- Added **REQ-agent-710** (delta `deltas/agent.md`): the tool loop hands
  `privateText` to `onPrivateReply` and never puts it in a model request,
  tool message or event; `TaskResult.privateReplies`; the prompt rule.
- Added **REQ-cli-710** (delta `deltas/cli.md`): `task run` puts the texts
  on `TaskResult.privateReplies` (json / ndjson result frame; deduped).
- Added **REQ-discord-710** (delta `deltas/discord.md`): the Discord agent
  client validates `privateReplies`; the bridge DMs them to whoever asked on
  chat, a button pick, an Answer form submit, `/session start` and
  `/work`, with the "sent privately" (or "couldn't DM") note on the channel
  answer and never the text.
- HI: MEMORY-7.a (captured in this PR). MEMORY-1..9, MEMORY-ACL-1..6 and the
  other families unchanged. No acceptance criteria beyond the captured text
  and the round-12 decision; open design points are in `design.md` for Leif.
