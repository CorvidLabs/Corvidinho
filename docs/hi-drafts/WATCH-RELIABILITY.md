---
status: draft
families: [WATCH, GITHUB]
owner: leif
issue_hints: [19]
---

# WATCH reliability gaps (draft — NOT captured)

**Status:** Draft for Leif confirm. Do **not** copy into `hi/` until confirmed.
Do not invent numbered AC beyond what Leif approves.

## Intent (proposed)

After WATCH auto-ack, Corvidinho should leave a durable trail of what the agent
did and how spawn finished, and should back off cleanly when GitHub returns 403
rate-limit — without spamming the API or inventing new product surfaces.

## Proposed criteria (for confirm)

- **WATCH-RELIABILITY-1 (draft)**  After a successful auto-ack on mention/comment
  start or continue, post a short agent **summary** comment on the same GitHub
  thread when the agent run finishes (success or failure), once per event id.
- **WATCH-RELIABILITY-2 (draft)**  Persist spawn **outcome** logging (start,
  exit code / error class, duration) somewhere ops can read (structured log
  and/or durable store) without requiring Discord.
- **WATCH-RELIABILITY-3 (draft)**  On GitHub **403 rate-limit**, back off using
  `Retry-After` / reset headers (or a documented default) before the next poll
  cycle; do not tight-loop; surface a clear log line.

## Out of scope (unless Leif adds)

- Webhook ingress (poll-first remains default).
- Inventing new allowlist semantics.
- Discord noise beyond existing HEAR paths.

## Notes

Related shipped: REQ-watch-007 (poll counters, auto-ack, ignore own mentions).
