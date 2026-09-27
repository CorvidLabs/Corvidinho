---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: requirements
---

# Requirements

REQ-watch-005 (processed ids deduplicated), REQ-watch-007 (ack at most once
per event id), REQ-watch-009 / WATCH-RELIABILITY-1 (summary at most once per
event id) and ALLOW-1 (never act on non-allowlisted senders) were broken by a
restart or a stranger's mention flood. Added REQ-watch-247: with a DB the
processed / acked / summarized id sets persist per kind and are not
count-evicted; denied ids live in a separate in-memory set; a failed id write
leaves the event for the next cycle without aborting it. REQ-watch-005, 007,
009 and 037 are unchanged.
