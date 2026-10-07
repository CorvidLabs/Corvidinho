---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: requirements
---

# Requirements

- AGENT-18.a (on main, `hi/agent.md`): "On Corvidinho it may approve and
  archive its own SpecSync change once verify is green; in other repos a
  human approves, reviews and finalizes." With SAFE-21 (the shared walker)
  and AUTONOMY-9 (no Approve card for a refused command).
- Modified (full text kept, two bullets and three acceptance criteria
  added): REQ-plugins-1818 — patterns read as every word they may stand
  for; an expanding, pattern or xargs-supplied subcommand fails closed.
- No env var, config key, flag, NDJSON field, protocol, table or schema
  change.
