---
hi: 1
families: [WATCH]
owner: leif
issue_hints: [19]
---

# Watch

## Intent

After WATCH auto-ack, Corvidinho should leave a durable trail of what the agent
did and how spawn finished, and should back off cleanly when GitHub returns 403
rate-limit — without spamming the API or inventing new product surfaces.

## Criteria

- **WATCH-RELIABILITY-1**  After a successful auto-ack on mention/comment
  start or continue, post a short agent **summary** comment on the same GitHub
  thread when the agent run finishes (success or failure), once per event id.
- **WATCH-RELIABILITY-2**  Persist spawn **outcome** logging (start,
  exit code / error class, duration) somewhere ops can read (structured log
  and/or durable store) without requiring Discord.
- **WATCH-RELIABILITY-3**  On GitHub **403 rate-limit**, back off using
  `Retry-After` / reset headers (or a documented default) before the next poll
  cycle; do not tight-loop; surface a clear log line.

## Notes (not numbered AC)

- Related shipped: REQ-watch-007 (poll counters, auto-ack, ignore own mentions).
- Out of scope unless separately HI'd: webhook ingress (poll-first remains
  default); new allowlist semantics; Discord noise beyond existing HEAR paths.
- Operator inventory: [`docs/WATCH.md`](../docs/WATCH.md).
