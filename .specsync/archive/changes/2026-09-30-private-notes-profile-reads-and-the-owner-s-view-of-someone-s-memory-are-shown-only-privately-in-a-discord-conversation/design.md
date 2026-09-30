---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: design
---

# Design

- **The model never sees it.** A private read in a Discord conversation
  returns `{ ok, data: { sentPrivately, what }, message:
  SENT_PRIVATELY_MESSAGE, privateText }`. `stringifyToolPayload` never
  reads `privateText`, so the tool message, the ToolResult event, the
  ndjson ToolResult frame and the summary hold only the placeholder. Nothing
  the model writes afterwards — the answer, an ask, a tool argument, a file,
  a PR body, a later turn, a stored memory — can repeat the text.
- **One path out.** `runToolLoop` → `onPrivateReply` → `task run` puts it
  on `TaskResult.privateReplies` (deduped) → the result frame → the Discord
  agent client (`privateRepliesFromUnknown`, capped) →
  `AgentSpawnResult.privateReplies` → `deliverPrivateReplies`
  (`src/discord/private-reply.ts`): scrubbed, split, one DM per part to the
  person who asked, over the forget card's `sendDm`. Chat, button pick,
  Answer form submit, `/session start` and `/work` all call it before the
  answer goes out, then put `PRIVATE_SENT_NOTE` / `PRIVATE_NOT_SENT_NOTE`
  on top of the channel answer (`withPrivateNote`). The recipient is always
  the acting user: the person themself for their own reads, the owner for a
  `--person` read (owner-only).
- **Nowhere private ⇒ refused.** A schedule (a role session without a
  conversation) and a GitHub thread refuse the owner's `--person` view and
  `memory-profile`; private notes keep their existing refusals. The local
  CLI (no role session) is the operator's own terminal and is unchanged.
- **Unchanged:** own non-private recall and the chat / button / WATCH memory
  inject (MEMORY-8/9), the ACL, forget-me, project memory, schedules' and
  WATCH's posting (they never deliver `privateReplies`).

## Design choices pending Leif

Each is the most conservative reading of MEMORY-7.a and the round-12 decision;
none adds a criterion.

1. **The tools deliver privately and the model gets only a placeholder**
   (the brief's second option), rather than delivering the model's whole
   answer privately: the model cannot answer questions from a profile, private
   notes or the owner's view ("what's Tofu's timezone?" sends the listing by
   DM and the model says so) — the only way to guarantee a repeat never
   reaches a shared channel.
2. **A DM on every surface**, including `/session start`, `/work` and
   button / Answer resumes (no ephemeral follow-up yet): one delivery path,
   the forget card's. If the DM does not go out, nothing is shown anywhere;
   the channel note says so (no channel fallback, no ephemeral fallback).
3. **`memory-profile` is refused in GitHub threads** (the brief said WATCH
   already refuses these reads; on main a declared commenter could still read
   their own profile there). This narrows REQ-plugins-067.
4. **Schedules refuse** the owner's `--person` view and `memory-profile`
   (a schedule posts into a shared channel and has no conversation to DM
   from), as private notes already are.
5. **Everyday own recall is not a "profile read"**: `memory-recall` of the
   person's own non-private rows and the automatic memory inject still reach
   the model in a shared channel (MEMORY-8/9); only `memory-profile`, private
   notes and the owner's `--person` view are private.
6. The channel note sits on top of the answer; the DM starts with a short
   "Private — only you can see this" header; private listings show up to 500
   characters per row.
