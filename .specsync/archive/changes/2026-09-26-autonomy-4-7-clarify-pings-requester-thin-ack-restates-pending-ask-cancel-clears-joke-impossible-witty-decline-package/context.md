---
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
artifact: context
---

# Context

Leif confirmed AUTONOMY-4..7 (append to captured AUTONOMY-1..3). Live dogfood
on v0.0.19 showed three root causes: (1) `formatAskReply` always pings the
owner on clarify; (2) thin replies like `ok` on a blocked session clear via
the agent treating them as answers; (3) joke/impossible physics asks open
ask-human / long MCQs.

Constraints: CorvidLabs/Corvidinho only; do not touch Corvidinho-run live
bridge worktree while implementing; SpecSync full cycle; bump to 0.0.20;
PRs via `gh` as corvid-agent. Prefer bridge-level thin-ack gate for
reliability over relying on the model.
