---
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
artifact: context
---

# Context

Bug agent-loop-2 (high). `runTask` reset `filesChanged` to the current
attempt's list, and `wantVerify` needs a non-empty list. So after a failed
verify, a retry that changed nothing (the provider returned HTTP 503, the model
only answered in text, or its write was refused) skipped verify and returned
`state=done`, `verifySkipped=true`: the CLI exited 0 with the broken file
still on disk. Provider failures (bad key, outage, network error) came back
from `execute` as an ordinary summary with no files, so a first-attempt
provider failure was also `done`, exit 0; Discord `/work` marked it
completed and bridges reported `ok=true`.

This breaks AGENT-4 (never done until verify passed, or say plainly that it
failed) and AGENT-8 (the reported state must be true). The existing loop tests
only covered retries that returned files.
