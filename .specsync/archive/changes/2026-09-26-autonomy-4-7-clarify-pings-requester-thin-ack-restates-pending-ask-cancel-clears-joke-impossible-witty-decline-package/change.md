---
id: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
state: archived
type: feature
base_commit: 3af288a04306b7463f1275d4db93001ca51bede2
---

# AUTONOMY-4..7 clarify pings requester, thin-ack restates pending ask, cancel clears, joke/impossible witty decline; package 0.0.20

## Intent

AUTONOMY-4..7 clarify pings requester, thin-ack restates pending ask, cancel clears, joke/impossible witty decline; package 0.0.20

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- AUTONOMY-4: formatAskReply clarify pings requesterDiscordId (owner only when stuck or requester===owner); AUTONOMY-5/6: session.pendingAsk persisted; thin ack restates ask without clearing blocked or running agent to done; cancel clears pending; substantive continue answers; AUTONOMY-7: ASK_AGENT_SYSTEM_INSTRUCTIONS covers joke/impossible witty decline; package 0.0.20; fixture tests for ping targets, thin-ack restate, cancel clear; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
