---
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
artifact: requirements
---

# Requirements

- AUTONOMY-4: clarify mentions the requester Discord id; stuck mentions the
  configured owner (or requester when requester===owner).
- AUTONOMY-5: thin acks while `pendingAsk` is set restate the question once;
  do not spawn the agent to “done”.
- AUTONOMY-6: pending ask clears only on substantive continue or explicit
  cancel; session stays blocked otherwise.
- AUTONOMY-7: system prompt steers joke/impossible asks to witty decline or
  tiny demo, not ask-human first.
- Package 0.0.20; fixture tests cover ping targets, thin-ack restate, cancel.
