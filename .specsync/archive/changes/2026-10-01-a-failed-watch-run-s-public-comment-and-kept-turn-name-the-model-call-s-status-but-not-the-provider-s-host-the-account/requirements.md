---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: requirements
---

# Requirements

- REQ-watch-009 (modified): on the public thread a failed run's model-call
  line SHALL NOT name the provider's host (`watchPublicFailureLine`); the
  `[watch] run failed` log line SHALL keep it; any other reason line is shown
  as before. New acceptance lines pin the end-to-end comment, log and turn,
  and every `modelCallFailedLine` shape.
- REQ-watch-472 (modified): a failed run's kept agent turn is the line its
  comment shows (no host), never a provider's reply body or host.
- No hi criterion is added or changed; no env var, config key, flag or new
  GitHub-visible surface.
