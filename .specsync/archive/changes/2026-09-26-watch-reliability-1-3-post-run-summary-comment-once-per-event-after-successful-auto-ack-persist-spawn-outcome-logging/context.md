---
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
artifact: context
---

# Context

WATCH already ships REQ-watch-007 (poll counters, auto-ack, ignore own mentions).
Leif confirmed draft `docs/hi-drafts/WATCH-RELIABILITY.md` → live `hi/watch.md`
criteria **WATCH-RELIABILITY-1..3** (2026-09-26): post-run summary after successful
auto-ack, persist spawn outcomes without Discord, and back off cleanly on GitHub
403 rate-limit.

Constraints: Corvidinho-only; poll-first remains default (no webhook); no new
allowlist semantics; Made with Corvidinho attribution on outbound comments;
eager package bump to **0.0.10** (tip already at 0.0.9; open #140 also claims 0.0.9).
