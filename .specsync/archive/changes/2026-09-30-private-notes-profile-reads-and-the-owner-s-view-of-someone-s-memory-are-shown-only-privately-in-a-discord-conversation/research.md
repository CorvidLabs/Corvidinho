---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: research
---

# Research

- Memory plugins (`plugins/memory/commands.ts`): the subject comes from the
  bridge env (`pickSubject`); private notes need a conversation
  (`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`); `--person` is owner-only; results
  go back as `data` (json, the tool loop) and `message`. Nothing marks a
  result as private.
- Tool loop (`src/agent/execute.ts`): the tool message and the ToolResult
  event come from `stringifyToolPayload` (`ok`, `exitCode`, `message`,
  `error`, `data`); `PluginHandlerResult.image` is the precedent for a
  field kept off tool text. SAFE-13's `onInjection` → `task run` →
  `TaskResult.injection` → result frame → `injectionNoticeFromUnknown` in the
  spawn client is the precedent for carrying a run fact to the bridge.
- Bridge DMs: the gateway's `sendDm` (`user.send`, no mentions parsed, cut
  at 1900) already delivers the forget card and its outcome notice
  (MEMORY-ACL-6); `splitDiscordMessage` splits fence-safe; `scrubSecrets`
  is SAFE-6.
- Surfaces that run the agent for someone and post in a channel: chat
  (`onMessage`), a button pick and an Answer form submit (`onComponent`),
  `/session start` and `/work` (slash handlers). Schedules post to a
  channel with no conversation; WATCH posts in public GitHub threads.
- Delegate / council workers drop every `CORVIDINHO_ACTING_*` key, so a
  worker has no actor and every personal memory read already refuses there.
- Options weighed (from the brief): (a) mark results private and deliver the
  whole answer privately — the model still sees the text, so a repeat through
  a tool argument (a post, a file, a PR), an ask stub, a later turn or a
  stored memory could still reach a shared channel; each path would need its
  own guard; (b) the tool hands its text past the model and the model gets a
  placeholder — nothing the model writes can carry it. (b) is taken: it is the
  one that guarantees the text never reaches a shared-channel post even if
  the model tries to repeat it.
