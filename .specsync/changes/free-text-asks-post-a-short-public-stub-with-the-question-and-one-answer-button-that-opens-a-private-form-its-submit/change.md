---
id: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
state: implementing
type: feature
base_commit: f1809a59b41a4f33506843a5c54a7796f57e626c
---

# Free-text asks post a short public stub with the question and one Answer button that opens a private form; its submit passes the same gates as a button press and resumes the requester's session like a reply; replying in the channel still works (DISCORD-ASK-4.a)

## Intent

Free-text asks post a short public stub with the question and one Answer button that opens a private form; its submit passes the same gates as a button press and resumes the requester's session like a reply; replying in the channel still works (DISCORD-ASK-4.a)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A clarify or stuck ask whose choices cannot be listed posts (chat, a button-pick or form resume, /work, /session start) the question quoted in the public post with the hint 'Press Answer to answer privately, or reply to this message.' and exactly one Answer button, keeps its footer embed and records the post as the ask's stub; the requester's press opens a Discord modal (response type 9) with a short title and one required paragraph input capped at ASK_QUESTION_MAX (within Discord's 4000); the modal submit (interaction type 5) passes the same channel, actor/deny-list, mute/rate, not-yours and ~30-minute expiry gates as a button press (refusals ephemeral only, no run, ask kept), is SAFE-6 scrubbed and resumes the requester's session with the same prior-question block a reply gets, in the stub (thin-updated, then edited into the answer), with an ephemeral ack dropped when the run ends; a late press or submit gets 'that choice expired' and the ask stays for a reply; a thin reply restates it with its live Answer button; a reply still answers it; a spend-cap stop and schedule asks are unchanged; the new bridge-harness tests fail on the base source and pass on the branch

## No-spec Rationale

Not applicable
