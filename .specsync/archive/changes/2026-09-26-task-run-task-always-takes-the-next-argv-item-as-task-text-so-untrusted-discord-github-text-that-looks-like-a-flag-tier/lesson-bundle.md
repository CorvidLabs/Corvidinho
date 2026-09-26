# Lesson bundle — task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Task run --task always takes the next argv item as task text, so untrusted Discord/GitHub text that looks like a flag (--tier=code, --no-verify) can never be parsed as a CLI flag; --task=TEXT may span lines
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: src/cli.ts, tests/cli.task-argv.test.ts
- **Acceptance**: A --task value starting with - is kept as task text; tier/max-retries/verify flags inside task text are never applied; multi-line --task= keeps all lines; fixture tests

## Evidence

- Verification commit: `bd9c4da9770050bf8ee0d48684093f79fc132f65`
- Base commit: `20fb34ff8db5759a2aad968e74d1d21b4c344b83`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Found while reviewing PR #139. `parseGlobalFlags` only took the value after
`--task` when it did not start with `-`. The Discord bridge and WATCH pass the
user's message (Discord) or mention text (GitHub) as that value. A message
such as `--tier=code`, `--no-verify` or `--max-retries=9` therefore lost its
task text and was parsed as a CLI flag, letting message text pick the
capability tier. AGENT-5 says the operator picks the provider and tier, not
the message author.

## From the change's design.md

# Design

- `--task` consumes the next argv item unconditionally (when present).
- `--task=TEXT` matches across newlines (`/s`), so multi-line text is kept.
- `parseGlobalFlags` is exported for unit tests; behavior of other flags is
  unchanged. A trailing `--task` with no value leaves task text unset.

## From the change's testing.md

# Testing

tests/cli.task-argv.test.ts: flag-looking task text (`--tier=code`,
`--tier`, `--no-verify`, `-h`, `- fix x`, `--json`, `--max-retries=9`) stays
task text and sets no flag; `--task --tier code` does not raise the tier;
multi-line `--task=` keeps all lines; normal flags still parse; trailing
`--task` leaves text unset. Plus `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100`, fledge verify.

## Where these lessons go

- `specs/cli/context.md`
