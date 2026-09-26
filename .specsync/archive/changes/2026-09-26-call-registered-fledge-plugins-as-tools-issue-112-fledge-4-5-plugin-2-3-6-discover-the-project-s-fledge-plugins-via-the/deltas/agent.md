---
module: agent
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
---

# Delta — agent (Fledge tools in the dangerous catalog #112)

## Added

### REQUIREMENT REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged.

Acceptance Criteria
- includeDangerous + code tier + allowlist: the first request offers `fledge-hello`; the model's call runs the fake fledge and the ToolResult succeeds with the plugin output.
- Default catalog: no `fledge-*` tool is offered and none is registered.
- Existing tool-loop tests pass unchanged.
