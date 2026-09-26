# Lesson bundle — capture-leif-s-decision-129-retire-cli-1-cli-2-cli-6-cli-9-in-hi-cli-md-with-reason-no-human-cli-humans-use-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif's decision (#129): retire CLI-1, CLI-2, CLI-6, CLI-9 in hi/cli.md with reason 'no human CLI; humans use Discord/GitHub'; keep CLI-7 and CLI-8 for the daemon
- **Kind**: Documentation
- **Paths**: hi/cli.md
- **Acceptance**: hi/cli.md lists CLI-1, CLI-2, CLI-6 and CLI-9 under Retired with the reason 'no human CLI; humans use Discord/GitHub'; CLI-3, CLI-4, CLI-5, CLI-7 and CLI-8 stay live; hi check passes; no code or canonical spec change

## Evidence

- Verification commit: `8c951a96e9b189b5f074fcf703e1199187d31ed9`
- Base commit: `06e2b08c7c53f59adb122f7a6c9025a007b55838`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Leif decided in the orc session (2026-09-26, issue #129) that there is no human-facing CLI: humans use Discord and GitHub. Retire CLI-1, CLI-2, CLI-6, CLI-9; keep CLI-7 (machine output) and CLI-8 (daemon). CLI-3/4/5 were not named and stay live. The Intent paragraph of hi/cli.md is left untouched for Leif to reword if wanted.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
