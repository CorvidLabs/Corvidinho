---
module: cli
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
---

# Delta: cli (task run streams the must-ask gate's notes; a no says why)

## Added

### REQUIREMENT REQ-cli-097

For the run's duration, `task run` SHALL route the must-ask gate's notes into
its event stream as `Text` events (`setMustAskNotifier`: the "waiting for the
owner's OK on an Approve card" line and the approval line, each tagged with
AUTONOMY-9 or AUTONOMY-10) and restore the previous notifier after, so text
mode prints them on stderr and `--output ndjson` streams them as `Text`
frames (protocol unchanged). `plugins run` and any caller without a notifier
SHALL print them on stderr. A lapsed, denied or unraisable card SHALL end the
call with a refusal saying why: with no bridge the card lapses, which means
no, and the CLI prints why (AUTONOMY-9/10 with SAFE-18/20). No flag or env
var.

Acceptance Criteria
- The notifier receives the wait line (naming the one-time code for prod) and the approval line; with no notifier the wait line goes to stderr.
- A lapse's refusal says the running bridge DMs the card and that with no bridge it lapses.
