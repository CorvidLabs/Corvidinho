---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: requirements
---

# Requirements

HI: AGENT-3 ("when I interrupt it, it actually stops instead of finishing in
the background").

- REQ-cli-244 (modified): a SIGINT or SIGTERM `task run` started with
  ignored is not hooked and stays ignored (as the REQ-plugins-154 hook
  does). New acceptance criterion: started with SIGINT ignored, the run and
  its lane survive a SIGINT; SIGTERM still exits 130 with a cancelled
  `result` frame.
- REQ-agent-244 (modified): after an abort the default verify runner waits
  at most 250 ms for the lane's output pipes, so an escaped lane process
  holding a pipe cannot keep the cancelled run from returning. New
  acceptance criterion: such a run exits 130 with a cancelled `result`
  frame within seconds.

Unchanged: REQ-agent-003, REQ-cli-073 / REQ-agent-073 (NDJSON),
REQ-plugins-154 (reused, not changed).
