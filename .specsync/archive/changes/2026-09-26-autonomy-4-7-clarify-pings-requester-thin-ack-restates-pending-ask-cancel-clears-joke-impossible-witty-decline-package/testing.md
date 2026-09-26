---
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
artifact: testing
---

# Testing

- Unit: `formatAskReply` clarify→requester, stuck→owner, requester===owner.
- Unit: `isThinAck` / `isCancelAsk` fixtures (ok/k/sure/emoji vs real answers).
- Bridge: blocked ask sets pendingAsk; thin continue restates without agent done;
  cancel clears; substantive continue runs agent with prior-question context.
- Scheduler: clarify pings createdBy; stuck pings owner; dedupe still works.
- `bun test` + `fledge lanes run verify --non-interactive` + `specsync check`.
