---
module: watch
---

# Testing

- `tests/watch.router.test.ts` — allow/deny/continue
- `tests/watch.config.test.ts` — fail-start + expand repos
- `tests/watch.poller.test.ts` — fixture searcher + poll cycles + dedup
- `tests/watch.cli.test.ts` — missing token clean exit; help lists watch
- `tests/watch.session-store.durable.test.ts` — schema v6, durable reload, soft TTL keep-alive/expiry, one session per issue, SAFE-6 topic scrub, poller restart continuity, stop halts mid-cycle, single-flight cycles, per-event failure isolation, second-watcher row replacement (REQ-watch-037)
- `tests/watch.dedup-durable.test.ts` — handled ids survive a poller restart (no second run/ack/summary), a 2000-id stranger flood cannot evict a handled trusted id, a failed id write leaves the event for the next cycle, durable per-kind id stores (REQ-watch-247)
