---
module: plugins
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
---

# Delta — plugins (council autonomous plugin, #118)

## Added

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
(AUTONOMOUS-1), when the delegation depth cap is reached, when the lead's
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
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent council budget are refused with exit 2 and spawn nothing. A missing question and an unknown tier exit 1.
- Against a fake bin, 3 voices make 7 worker runs. Each is `task run --non-interactive --tier read --output ndjson` with `--task` last and no `--no-verify`. Each env has depth 1, tier read, non-interactive, an empty `CORVIDINHO_ALLOWLIST` (even when the lead allowlists dangerous tools), `CORVIDINHO_ACTING_IS_ADMIN=0`, and no GitHub / Discord token or audit key. The data carries the decision and a 7-entry transcript.
- `--tier code` is clamped to tool. A failed chair gives ok=false, exit 1, with the transcript. The council time cap gives exit 130 and state cancelled. The limiter allows one council at a time and 2 per run. A non-ADMIN role session's `runPlugin council` is refused with "not allowed for your role" and spawns nothing.
