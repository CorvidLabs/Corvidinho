---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: requirements
---

# Requirements

HI: CLI-4 (plain-language "what is missing" instead of failing mid-task) and
CLI-7 (human text or a single JSON result) in `hi/cli.md`; SAFE-6 (secrets
scrubbed) in `hi/safe.md`; WATCH-RELIABILITY-3 (403 rate-limit backoff,
unchanged) in `hi/watch.md`. CLI-1/2/6/9 are retired and not cited.

Added REQ-cli-419 (CLI error boundary), REQ-discord-417 (one scrubbed error
line + clean gateway login failure), REQ-watch-418 (stop on GitHub 401,
one-line poll errors).
