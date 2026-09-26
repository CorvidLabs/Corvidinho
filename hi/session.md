---
hi: 1
families: [SESSION]
owner: leif
---

# Session

## Intent

Sessions stay short-lived by default. Soft TTL keeps an active conversation; idle or a new topic starts fresh. Cross-session continuity comes from MEMORY, not a long-lived process.

## Criteria

- **SESSION-1**  Prefer fresh sessions over reusing stale ones by default.
- **SESSION-2**  Soft TTL of about 30–60 minutes: continued activity keeps the same session.
- **SESSION-3**  Idle expiry or a clear new topic starts a new session.
- **SESSION-4**  Cross-session continuity comes from MEMORY, not from a long-lived process.
