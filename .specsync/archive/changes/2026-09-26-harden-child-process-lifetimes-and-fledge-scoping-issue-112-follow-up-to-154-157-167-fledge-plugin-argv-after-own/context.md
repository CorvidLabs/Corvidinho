---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: context
---

# Context

Reviews of three merged PRs found child-process and scoping gaps (bug-fix, no
new feature; Part of #112):

- #154 (Fledge plugins as tools): `fledge plugins run <command> <argv...>`
  let model argv such as `--help` / `--json` / `--ni` be parsed by fledge
  itself (clap reads options before the first positional). A timeout killed
  only the fledge pid, so native plugins and anything they backgrounded kept
  running. Registration was global by name, so in a long-running process a
  command discovered for project A ran in project B under A's origin / tier.
- #157 (daemon): runs abandoned after the shutdown grace were recorded failed
  but their `task run` child (and its tools) kept working.
  `ScheduleStore.markRunStarted` had no production caller left after
  `claimRun`.
- #167 (delegate): a timeout / abort sent SIGTERM then SIGKILL to the worker
  pid only; its plugins and depth-2 workers outlived the limit.

Captured HI this rests on: AGENT-3 (interrupt actually stops), FLEDGE-4 /
PLUGIN-2 / PLUGIN-3 (registered for the project; declared danger and tier
enforced), SAFE-1 (dangerous consent), CLI-8 / AUTONOMOUS-4 (daemon). No new
HI, env var, slash command or product surface. SAFE-1 and ROLES-CHAT gates are
unchanged.

Constraints: Linux only (the `/proc` walk is fine), Bun 1.4.2 (`detached:
true` = setsid), many parallel workers (new logic lives in a new module,
small hooks in hot files).
