---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: design
---

# Design

- `plugins/fledge/spawn.ts` — `spawnCapped` (argv array, stdin ignored, SIGKILL
  on timeout, reader cancel after a short grace so a grandchild holding the
  pipe cannot hang us, per-stream byte cap) and `fledgeChildEnv` (drop
  Corvidinho/Discord/LLM secrets, set `FLEDGE_NON_INTERACTIVE=1` and
  `CORVIDINHO_PROJECT_ROOT`).
- `plugins/fledge/discover.ts` — list (required) + audit (best effort) in
  parallel; validate names; clean text; every failure → `ok:false` + reason.
- `plugins/fledge/commands.ts` — `fledge-<command>` PluginCommand:
  `dangerous: true` always (no danger field exists in fledge manifests; native
  plugins are unsandboxed binaries, so Corvidinho cannot tell read-only from
  destructive); `minTier` 2 unless wasm-sandboxed without `exec` (1). Small
  description without source path. Output scrubbed + capped; timeout → 124.
- `plugins/fledge/index.ts` — async `loadFledgePlugins` (per-cwd cache that is
  re-validated against the registry), collision skip with reason, status lines.
- `src/plugins/toolCost.ts` — cost on `toolDefForEntry` JSON, chars/4 tokens,
  report (total vs 8000 budget, by origin, largest, >250 oversized), text view.
- Small hooks only: `src/cli.ts` (`plugins list` / lazy `plugins run fledge-*`),
  `src/agent/execute.ts` (discover only when `includeDangerous`),
  `src/agent/tools.ts` (extract `toolDefForEntry`), `src/plugins/types.ts`
  (optional `origin`). Registry `list()` shape unchanged. No schema/DB change;
  nothing new is persisted.
