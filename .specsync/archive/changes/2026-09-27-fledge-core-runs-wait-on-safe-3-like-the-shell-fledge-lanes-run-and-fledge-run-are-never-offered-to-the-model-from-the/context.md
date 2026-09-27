---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: context
---

# Context

#261 (merged, `f98e5d8`) put allowlisted dangerous tools in the task-run
catalog (CLI-3 / SAFE-1). It kept `shell-exec` and the node/python/cargo
runners out even when named (`SAFE3_PENDING_TOOLS`): each starts in the
project dir, which is not a clamp, and whether they can be kept inside the
project root is Leif's open SAFE-3 question.

#262 (this branch, written before #261 merged) adds the Fledge core builtins
(PLUGIN-1). `fledge-lanes-run` and `fledge-run` run whatever commands a lane
or task in the project's `fledge.toml` gives them, and `fledge-run` appends
the model's args to the task's command. #262 describes their gate as "the
same as for shell-exec and the runners" and lists "no SAFE-3 cd clamp
applies" as a leftover risk. #262 said task runs offered no dangerous tool at
all, which stopped being true once #261 merged. So an allowlist entry for
`fledge-run` would have put a shell-equivalent in the model's catalog while
`shell-exec` itself stays out.

Second, #261's `allowsFledge` starts Fledge plugin discovery (a `fledge
plugins list` / `plugins audit` spawn) for any allowlisted `fledge-*` name.
The four core builtins are registered with the other builtins and need no
discovery, but naming one (for example `fledge-lanes-list`) still spawned
fledge.

Scope: `src/agent/tools.ts`, `src/agent/execute.ts`, the test file, the
agent spec (REQ-agent-501 / REQ-agent-112 and prose) and
`docs/DISCORD-GO-LIVE.md`. `corvidinho plugins run` and `runPlugin` are
unchanged. #232 and #233 are not touched.
