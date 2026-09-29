---
id: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
state: draft
type: feature
base_commit: 3b323f3258e3393aabcbb2f44092bf5524ff884c
---

# Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101)

## Intent

Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101)

## Affected Canonical Specs

- `plugins`
- `agent`
- `cli`
- `discord`

## Acceptance Criteria

- In a Discord conversation memory-recall --category private, the owner's memory-recall --person view and memory-profile (own or --person) return their text only in the result's privateText; data and message - all the model, the tool message and the ToolResult events see - are a sent-privately placeholder, so the model can never repeat it; in a schedule run or a GitHub (WATCH) thread those reads are refused (memory-profile on GitHub included); the local CLI with no role session shows them on the operator's terminal as before; the tool loop hands privateText to onPrivateReply, task run puts it on the result's privateReplies (json / ndjson, a retried attempt's repeat kept once), the Discord agent client reads it back validated (non-empty strings, at most 5, each cut to 6000); the bridge sends each private reply to the person who asked by direct message (scrubbed, split under the 1900-character DM cap) on chat, a button pick and an Answer form resume, /session start and /work, and the channel answer gets a short sent-privately note on top - or, when no DM path exists or a part does not go out, a note that it could not be sent - and never the text, which the session thread never records; everyday own recall and the memory inject are unchanged; tests/memory.private-view.test.ts covers each and fails on main

## No-spec Rationale

Not applicable
