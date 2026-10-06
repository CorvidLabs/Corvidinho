---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: requirements
---

# Requirements

- AGENT-18.a (captured, `hi/agent.md`, Leif 2026-09-28 round 13): "On
  Corvidinho it may approve and archive its own SpecSync change once verify
  is green; in other repos a human approves, reviews and finalizes." Built
  here: the shell half — `shell-exec` never approves, reviews or finalizes a
  SpecSync change in any repo, since on Corvidinho the run's own settle step
  (not the shell) does it and elsewhere a human does.
- Kept: AGENT-18 SpecSync clause and the settle (REQ-plugins-518 / -519,
  REQ-agent-518 / -519, unchanged), SAFE-3 / SAFE-3.a (the clamp, owner-only
  shell), SAFE-21 / SAFE-21.a (foot-guns, credential-free env), AUTONOMY-9
  (prod asks; a refused command raises no card), PROCESS-3 (self-approval
  only on Corvidinho, only after verify).
- Added: REQ-plugins-1818.
- No env var, config key, flag, command, NDJSON field, protocol or schema
  change.
