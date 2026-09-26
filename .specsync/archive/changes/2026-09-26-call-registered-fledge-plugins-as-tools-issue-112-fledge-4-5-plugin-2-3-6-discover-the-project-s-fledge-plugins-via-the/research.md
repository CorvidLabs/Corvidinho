---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: research
---

# Research

- `fledge --help`, `fledge plugins --help`, `fledge plugins {list,run,audit} --help`
  and `fledge introspect --json` on the local fledge 1.8.0.
- fledge crate source (`src/plugin/{mod,list,run_plugin}.rs`,
  `src/protocol/mod.rs`, `src/cli.rs`): JSON envelopes, registry location,
  run resolution (`fledge-<name>` binaries, fledge-v1 protocol for manifests
  declaring `protocol = "fledge-v1"`), trailing-arg parsing.
- Real fledge accepts `fledge --non-interactive plugins run <cmd> --weird "a b"`
  (unknown command → exit 1, clean error) and returns empty envelopes when no
  plugins are installed.
- Corvidinho: `plugins/specsync` (Fledge-backed builtin), `plugins/shell`
  (dangerous + minTier 2 precedent, cwd pin), `src/plugins/run.ts` (SAFE-1 deny,
  SAFE-5 audit), `src/agent/tools.ts` (tool def shape), chars/4 token estimate
  already used in `src/discord/agent-client.ts`.
- Merlin steal targets named in the issue (`plugin.rs`, `context_budget.rs`)
  are not in this checkout; the budget view here is built from Corvidinho's own
  tool definition shape.
