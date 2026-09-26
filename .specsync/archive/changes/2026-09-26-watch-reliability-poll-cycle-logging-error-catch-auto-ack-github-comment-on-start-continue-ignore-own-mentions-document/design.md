---
change: watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document
artifact: design
---

# Design

- **Poll logging:** `pollOnce` logs `fetched/new/started/continued/refused/skipped`
  every cycle; interval/immediate callers wrap with `.catch` so errors surface.
- **Ignore own:** `fetchWatchEvents` skips issue body mentions and comments where
  `sender === mentionUsername` (no self-loop on our acks or own chatter).
- **Auto-ack:** new `src/watch/ack.ts` — injectable `AckClient` (Octokit live /
  echo dry-run/tests). On `start_session` / `continue_session` for
  `issue_comment` | `issues` only, when sender ≠ watch username and event id not
  yet acked, post short ack + Made with Corvidinho markdown footer via Octokit
  `issues.createComment` (same capability as github-issue-comment; watch stays
  self-contained). `AckedIdStore` dedups ack per event id.
- **Pagination:** raise search `per_page` to 100; document bury risk in
  `docs/WATCH.md` when org-wide noise exceeds one page.
- No new HI numbers; no allowlist / ProcessManager / webhook changes.
