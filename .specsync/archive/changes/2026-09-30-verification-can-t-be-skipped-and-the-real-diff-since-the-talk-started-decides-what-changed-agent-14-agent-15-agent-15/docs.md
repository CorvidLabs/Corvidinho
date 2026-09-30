---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: docs
---

# Docs

- `AGENTS.md`: the bootstrap line is
  `bun src/cli.ts task run --task "touch agent loop" --json` (no
  `--no-verify`).
- `fledge.toml`: `[corvidinho]` drops `verify_before_complete`; its comment
  says the gate has no off switch and a run that changed nothing ends with
  "no changes, nothing to verify".
- `docs/discord.md` (live source): verification can't be skipped; the real
  diff decides; the "no changes" note; a run after a blocked, failed or
  stopped run in the talk verifies every edit since the talk started.
- `docs/WATCH.md`: step 5 says verification can't be skipped.
- `src/discord/agent-client.ts`, `src/watch/agent-client.ts`: header
  comments match (no code change).
- Help and `TASK_RUN_USAGE` in `src/cli.ts` drop `--no-verify`.
- Specs: `agent.spec.md` (Public API, invariant, scenarios, error rows,
  files), `cli.spec.md` (`parseGlobalFlags` row, `RemovedFlagError`,
  `removedVerifyKeyDoctorCheck`, invariant, error rows),
  `discord.spec.md` (`src/worktree/base.ts` exports and files),
  `watch.spec.md` (dependency line), and each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
