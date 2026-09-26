---
change: watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document
artifact: context
---

# Context

Leif @mentioned @corvid-agent on arcsite#83 twice; the box WATCH process ran
but never posted in-thread replies. Diagnosis:

1. `void pollOnce()` swallows errors — log only shows the start line.
2. Spawn is local `task run` only — no automatic GitHub comment unless the LLM
   calls `github-issue-comment`.
3. Org search `per_page=30` can bury non-Corvidinho pings under Corvidinho noise
   (secondary).

CoS guidance: harden GH watch if flakes — this is a flake. No new numbered HI
(hi/github.md has GITHUB-1..6 only; fold under existing WATCH/ALLOW behavior).
Do not smash open discord-deny-polish PR #54 — branch from origin/main.
