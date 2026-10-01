---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: research
---

# Research

Where the provider's host could reach the public thread after #343:

- The summary comment of a failed run without an ask: `failureReasonFor`'s
  line, from the result frame's `error` = `modelCallFailedLine` — five shapes
  carry the host (HTTP status, timeout, network error, malformed reply, no
  failure detail). Fixed here.
- The kept agent turn (REQ-watch-472): replayed to the model on the next
  event, which could repeat it publicly. Fixed here.
- `providerId` is `new URL(baseUrl).host`, so URL credentials never appear
  (and `failureReasonFor` drops `user:pass@` anyway); a path or query is never
  part of it.
- Successful runs: the `(model fallback: …)` note uses model labels and
  `HTTP <status>`, never a host. The no-provider notice and the no-key line
  name env vars and the model, never a host (public on main already).
- A stderr line or a thrown message could name a URL; main posted up to 500
  chars of stderr, #343 posts at most one 200-char line — no new exposure;
  left as is.
- Model-mediated (not a harness path, left for a follow-up): a failed
  `delegate` worker's summary (`LLM HTTP …: <body>`) is handed to the lead
  model as its tool result (`plugins/autonomous/commands.ts`), and a council
  voice's failure enters the transcript; a lead that still finishes could
  quote it in its public success comment.
