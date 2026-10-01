---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: docs
---

# Docs

- `docs/WATCH.md`: the Run summary bullet says a failed run's comment is one
  plain reason line (where it comes from, scrub and cut, the log line, the
  kept turn, the operator-only JSONL keeping the scrubbed summary, asks and
  successes unchanged); the model fallback bullet notes a run that failed
  after failing over posts its reason line.
- `specs/watch/watch.spec.md` (files, Public API, Invariants, a behavioural
  example, error cases), `specs/cli/cli.spec.md` (files), and each module's
  `testing.md`.
- `docs/DAEMON.md` already says what `run.finished` reads (#340); no
  change. No CHANGELOG / STATUS / package.json edit (the release PR writes
  them).
