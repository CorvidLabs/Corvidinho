---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: requirements
---

# Requirements

- AGENT-13 (captured on main, `hi/agent.md`): "I configure its models
  (OpenAI-compatible, Ollama, Anthropic or a headless agent CLI), and there's
  no built-in default."
- AGENT-13.a (captured in this PR with `hi`, Leif's 2026-09-28 interview,
  round 17 on 2026-10-07): "A headless agent CLI model runs only in my own
  runs, with the same tools as my other models, inside that talk's own
  worktree; other runs skip it and use my next model."
- Kept: AGENT-10 (no-provider notice), AGENT-11 (fallback and its notice),
  AGENT-12 (the CLI turn is a model call: request timeout, the run's stop),
  AGENT-14 / AGENT-15 / AGENT-18 (one verify gate on the real diff), AGENT-17.a
  (model order), SAFE-2 / SAFE-2.a (protected files), SAFE-3.a (where the shell
  is offered), SAFE-6 (scrub), SAFE-8 / SAFE-14 / SAFE-16.a (spend caps, the
  unknown-price card), SAFE-13 (an injection takes the shell away), SAFE-21.a /
  SAFE-21.b (no git / GitHub / cloud credentials), GITHUB-9.a (reviewer).
- Surfaces where it may run: the owner's Discord chat and ask answers,
  `/session start`, `/work`, and a local `task run` in the worktree it made —
  the SAFE-3.a surfaces. Skipped: team / community runs, WATCH (owner-triggered
  included), schedules, delegate / council workers, `--here`, non-git folders,
  outside the talk's own worktree, no `shell-exec` allowlisted, below the code
  tier, after a SAFE-13 trip.
- Added: REQ-agent-1301 (the kind's run side), REQ-plugins-1301
  (`spawnCapped` stdin / tree kill, the reviewer). Modified: REQ-agent-179
  (the `cli` kind in the model list).
- One new optional env key, `CORVIDINHO_LLM_CLI_ENV`; no schema version, table,
  slash command or CLI flag.
