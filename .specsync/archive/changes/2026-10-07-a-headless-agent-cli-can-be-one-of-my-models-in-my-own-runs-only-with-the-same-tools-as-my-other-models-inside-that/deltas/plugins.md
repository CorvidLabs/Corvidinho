---
module: plugins
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
---

# Delta: plugins (spawnCapped feeds a headless agent CLI turn and stops what it leaves running; the GITHUB-9 reviewer is never a CLI — AGENT-13.a)

## Added

### REQUIREMENT REQ-plugins-1301

A headless agent CLI model runs only in my own runs, with the same tools as
my other models, inside that talk's own worktree (AGENT-13.a, captured in
this change's PR; REQ-agent-1301 holds the run side). The plugin side:

- `spawnCapped` (`plugins/fledge/spawn.ts`) SHALL take two optional options:
  `stdin` (text written to the child's stdin, then closed; default: stdin
  closed as before) and `killTreeAfterExit` (once the child exits, its tree is
  snapshotted and whatever it left running is killed, so nothing it started
  keeps changing files after the run checks them; default off). Every
  existing caller is unchanged.
- `resolveReviewer` (`src/work/review.ts`, GITHUB-9.a, REQ-plugins-092)
  SHALL never pick a `cli:` entry (AGENT-13): the review is one no-tools
  completion and a CLI is an agent with its own tools; with only `cli:`
  entries besides the authors there is no second model, as before.

Acceptance Criteria
- The headless CLI turn gets its prompt on stdin through `spawnCapped` (`tests/agent.headless-cli.test.ts`, the stand-in CLI logs it); the shell, runners and Fledge runs keep a closed stdin (their suites unchanged).
- `resolveReviewer({ CORVIDINHO_LLM_MODEL: "cli:fakecli --print,gpt-x", … }, [])` is `gpt-x`; with only `cli:fakecli --print` it is null.
