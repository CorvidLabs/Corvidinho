---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: design
---

# Design

- `src/autonomous/enabled.ts`: AUTONOMOUS-1 gate. Minimal TOML scrape of
  `<cwd>/fledge.toml` (same approach as `parseCorvidinhoSection`); enabled only
  for the literal `true` at key `corvidinho.autonomous.enabled` (table or
  dotted key). Any later `[table]` / `[[array]]` header ends the scope; inline
  tables and non-literal values are off. `autonomousSessionAllowed({cwd, env})`
  = enabled AND delegation depth below the cap (SAFE-9 session gate).
- `src/autonomous/delegate.ts`: worker core. Depth in
  `CORVIDINHO_DELEGATE_DEPTH` (unset 0; malformed fails closed to the cap 2).
  `clampChildTier(parent, requested)`: omitted means the parent tier (never a
  higher global default, the Merlin m#1136 bug class); above parent is
  clamped; unknown is refused. Spawn via `buildCorvidinhoArgv` (bun
  `--no-env-file` for `.ts`):
  `task run --non-interactive --tier T --output ndjson --task TEXT`
  with `--task` last. Forced env: depth+1, tier, non-interactive, the lead's
  effective allowlist, ADMIN off, no SAFE-4 confirm tokens. Bin is
  `CORVIDINHO_BIN`, else this checkout's `src/cli.ts` (never the cwd's).
  Limiter: 2 concurrent, 4 per process; refuse, never queue. The worker is
  killed (SIGTERM, then SIGKILL after 2s) on lead abort, 10 min timeout, or
  lead `exit`; its pipes are wrapped so a grandchild holding them cannot hang
  the lead beyond a 1s drain after exit. Summary SAFE-6 scrubbed, capped 4000.
- `plugins/autonomous/`: `delegate` PluginCommand with `dangerous: false`
  (adds no power the lead lacks; cost bounded by caps + SAFE-9 hiding),
  `minTier: 2`, `autonomous: true`. The handler re-checks every gate at run
  time (parse, AUTONOMOUS-1, depth, code tier, limiter) so `plugins run` or a
  model naming the tool cannot skip them.
- Hooks in shared files kept small: `PluginCommand.autonomous`,
  `PluginHandlerArgs.tier/signal`, `runPlugin` pass-through,
  `buildOpenAiTools({autonomous})` filter line, `createTaskExecute` computes
  the session gate and passes tier + signal to `runPlugin`, builtins load.
- Workers never pass `--no-verify` (REQ-cli-085, #85 always prove-before-done
  for product spawns): a worker that changed files runs the project's verify
  lane itself (AGENT-4 / 4.a retries), reports `verified` / `verifySkipped`,
  and its filesChanged also join the lead's result so the lead's own gate
  covers the combined change. Tool calls dispatch sequentially, so two workers
  of one lead do not verify the shared cwd at the same time.
