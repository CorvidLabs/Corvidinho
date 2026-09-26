---
module: cli
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
---

# Delta — cli (--task value is always task text)

## Added

### REQUIREMENT REQ-cli-143

`task run --task <text>` SHALL treat the next argv item as the task text even
when it starts with `-`, and `--task=<text>` SHALL keep text that spans
lines. The bridges pass untrusted Discord and GitHub text as that value, so
text that looks like a flag (for example `--tier=code`, `--no-verify`,
`--max-retries=9`) SHALL NOT be parsed as a CLI flag and SHALL NOT change
the capability tier, verify, or retry settings (AGENT-5, SAFE-1).

Acceptance Criteria
- A `--task` value starting with `-` is kept verbatim as the task text.
- Flag-looking task text never sets tier, max-retries, JSON, or no-verify.
- `--task=` with newlines keeps every line.
- Normal `--task TEXT --tier code --json` parsing is unchanged.
