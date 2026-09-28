---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: docs
---

# Docs

`docs/WATCH.md` "Durable sessions": handled event ids (processed, acked,
summarized) persist in `watch_event_ids` in the same DB, denied ids are kept
apart in memory, and the `not marked, retried next cycle` log variant is
named. The "Not yet" note no longer lists durable processed-id/ack dedup.
`specs/watch/watch.spec.md` Public API and Invariants name the store options
and the durable/denied split. No CHANGELOG / STATUS / package bump.
