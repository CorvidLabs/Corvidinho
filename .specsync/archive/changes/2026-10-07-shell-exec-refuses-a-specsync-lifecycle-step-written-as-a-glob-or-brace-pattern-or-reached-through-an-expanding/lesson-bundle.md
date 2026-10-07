---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: lesson-bundle
---

# Lesson bundle — shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding

AGENT-18.a tip orphan after #403. Squash left the change accepted with a
pre-squash implementation_commit that is not on main; finalize reached
accept, then the archive move hung / failed its post-move preflight on
another archive. Archive clears the stale change audit (same class as
#414 / #415 / #416).
`implementation_commit` is the squash `c7f8c043147cc0c0076463728891cb96a348835a`.
