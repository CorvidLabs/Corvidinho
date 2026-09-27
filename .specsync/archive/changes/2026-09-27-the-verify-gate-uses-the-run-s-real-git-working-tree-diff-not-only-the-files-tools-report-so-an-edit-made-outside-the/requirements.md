---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: requirements
---

# Requirements

HI: AGENT-4 ("It does not tell me the job is done until the project's verify
lane has passed, or it tells me plainly that verification failed"), with
AGENT-4.a (a retry keeps working with the failure output) inherited.

- REQ-agent-085 (added): with the gate on, `runTask` snapshots the run's git
  project before the first attempt and adds every path that differs from it
  to `filesChanged` before deciding to verify; untouched pre-run dirt and
  gitignored paths do not count; no git work tree ⇒ tool-reported only; an
  unreadable diff after a good snapshot fails closed; the gate off takes no
  snapshot; read-only git; no new flag / env / config / slash command.
  Cost and output stay bounded: only start-dirty paths are fingerprinted
  again, content hashing stops after a 64 MiB budget (stat after that), and
  at most 1000 real-diff paths per run join `filesChanged` so the NDJSON
  `result` line stays under the parser cap.
- REQ-agent-002 (modified): verify runs when the run changed files, reported
  by a tool or in the real diff. New acceptance criterion for an unreported
  working-tree change.
- REQ-agent-008 (modified): the execute result's tool-reported
  `filesChanged` is a lower bound for the gate, not all of it. New
  acceptance criterion for a code-tier `shell-exec` edit.
- REQ-discord-014 (modified): the "skips the verify lane when
  `filesChanged` is empty" clause follows the real diff too.
- REQ-discord-085, REQ-watch-085, REQ-watch-006 (modified): "empty
  filesChanged skips verify" becomes "an empty real diff with no
  tool-reported files skips verify".

Unchanged: REQ-agent-003 (skip path), REQ-agent-242 (union, provider error),
REQ-agent-244 (abort), REQ-cli-085 (`--no-verify` local opt-out).
