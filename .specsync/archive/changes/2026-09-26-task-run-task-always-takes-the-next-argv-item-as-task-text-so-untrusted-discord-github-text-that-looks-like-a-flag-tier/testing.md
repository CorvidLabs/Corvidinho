---
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
artifact: testing
---

# Testing

tests/cli.task-argv.test.ts: flag-looking task text (`--tier=code`,
`--tier`, `--no-verify`, `-h`, `- fix x`, `--json`, `--max-retries=9`) stays
task text and sets no flag; `--task --tier code` does not raise the tier;
multi-line `--task=` keeps all lines; normal flags still parse; trailing
`--task` leaves text unset. Plus `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, fledge verify.
