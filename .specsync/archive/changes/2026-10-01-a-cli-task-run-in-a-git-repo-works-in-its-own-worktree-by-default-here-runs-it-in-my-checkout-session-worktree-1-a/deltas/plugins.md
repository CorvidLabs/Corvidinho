---
module: plugins
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
---

# Delta: plugins (delegate and council workers are spawned with --here — SESSION-WORKTREE-1.a)

## Modified

### REQUIREMENT REQ-plugins-117

The system SHALL register autonomous extras as plugins (PLUGIN-5) from
`plugins/autonomous/` via builtins. `PluginCommand` SHALL accept
`autonomous?: boolean` (left out of the agent tool catalog unless the session
is allowed, REQ-agent-117 / SAFE-9). `PluginHandlerArgs` and `runPlugin`
options SHALL accept optional `tier` and `signal`, passed through to the
handler unchanged when given.

The `delegate` command SHALL declare `dangerous: false`, `mutating: true`,
`minTier: 2` and `autonomous: true` (PLUGIN-2). Being mutating (ROLES-CHAT-5:
a worker runs tools), a non-ADMIN role session SHALL never see it in the tool
catalog and `runPlugin` SHALL refuse it with exit 2 "not allowed for your role"
before the handler runs, spawning nothing (ROLES-CHAT-2/3/6). Its handler
SHALL, in order: parse
`[--skill NAME] [--tier read|tool|code] --task TEXT` (or positional text; the
skill is a short lowercase `[a-z0-9_-]` label; `--task` takes the next item
even when it starts with `-`) and exit 1 on a usage error; refuse with exit 2
and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the delegation depth cap is reached, when the lead's tier
(the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is below
code, or when the concurrency / per-run budget is spent; otherwise run one
worker (REQ-agent-117) in the plugin cwd with the lead's allowlist and abort
signal. The result data SHALL carry `skill`, `tier`, `tierClamped`, `depth`,
`exitCode`, `state`, `summary`, `filesChanged` and, when present,
`verified`, `verifySkipped`, `totalTokens`, `timedOut`, `aborted`, so the lead can synthesize the result
(AUTONOMOUS-5). The result SHALL be ok only when the worker exits 0 in state
`done`.

Acceptance Criteria
- `delegate` is registered with dangerous=false, mutating=true, minTier=2, autonomous=true.
- A non-ADMIN role session's `runPlugin delegate` is refused with exit 2 "not allowed for your role" and spawns nothing.
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent budget are refused with exit 2 and spawn nothing; bad args exit 1.
- Happy path against a fake bin: argv has `task run --here` (REQ-cli-122), `--non-interactive`, no `--no-verify`, the clamped `--tier`, and `--task` last with the skill / depth provenance header; env has depth 1, the worker tier, non-interactive, the lead allowlist, ADMIN 0 for a role-session lead and no confirm tokens; data carries skill / tier / depth / state / filesChanged / verified / verifySkipped.
- A failed worker yields ok=false with its exit code and a SAFE-6 scrubbed summary.

### REQUIREMENT REQ-plugins-118

The `council` command SHALL be registered from `plugins/autonomous/` with
`dangerous: false`, `mutating: true` (a council runs workers, ROLES-CHAT-5),
`minTier: 2` and `autonomous: true`. It is therefore hidden from the tool
catalog unless the session is allowed (REQ-agent-117 / SAFE-9), and it is
never offered to or run for a non-ADMIN role session (ROLES-CHAT-2/3/6). Its
handler SHALL, in order: parse `[--voices N] [--tier read|tool] --question
TEXT` (or positional text; `--question` takes the next item even when it
starts with `-`; N is clamped to 2..5, default 3; the question is at most
4000 chars) and exit 1 on a usage error or an unknown tier; refuse with exit
2 and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the run is not a top-level lead (a delegation depth
other than 0: a delegated worker never convenes a council, so no voice can
outlive a worker its lead stops, SAFE-9), when the lead's
tier (the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is
below code, or when the council budget is spent (one council at a time, at
most 2 per lead process); otherwise run a council (REQ-agent-118) in the
plugin cwd with the lead's abort signal. Every voice SHALL get an empty
allowlist and a non-ADMIN role env, whatever the lead's allowlist or role.
The result data SHALL carry `voices` (plus `voicesRequested` when clamped),
`tier`, `tierClamped`, `depth`, `state`, `decision`, `phases`, `transcript`
(the chair's text replaced by a pointer to `decision`), `filesChanged`,
`elapsedMs` and, when present, `totalTokens`, `timedOut` and `aborted`. The
result SHALL be ok (exit 0) only when the chair decided; otherwise it SHALL
be ok=false with exit 130 when cancelled and exit 1 when failed.

Acceptance Criteria
- `council` is registered with dangerous=false, mutating=true, minTier=2 and autonomous=true, and is listed in `plugins list`.
- The default catalog omits `council` at every tier. An allowed code-tier CLI / ADMIN session gets it; tool tier and non-ADMIN sessions do not.
- Autonomous off, depth 1 (a delegated worker), depth 2, tool tier, an omitted tier with the default env tier, and a spent council budget are refused with exit 2 and spawn nothing. The depth 1 refusal names the top-level-lead rule and spends no council budget. A missing question and an unknown tier exit 1.
- Against a fake bin, 3 voices make 7 worker runs. Each is `task run --here --non-interactive --tier read --output ndjson` (`--here`, REQ-cli-122) with `--task` last and no `--no-verify`. Each env has depth 1, tier read, non-interactive, an empty `CORVIDINHO_ALLOWLIST` (even when the lead allowlists dangerous tools), `CORVIDINHO_ACTING_IS_ADMIN=0`, and no GitHub / Discord token or audit key. The data carries the decision and a 7-entry transcript.
- `--tier code` is clamped to tool. A failed chair gives ok=false, exit 1, with the transcript. The council time cap gives exit 130 and state cancelled. The limiter allows one council at a time and 2 per run. A non-ADMIN role session's `runPlugin council` is refused with "not allowed for your role" and spawns nothing.
