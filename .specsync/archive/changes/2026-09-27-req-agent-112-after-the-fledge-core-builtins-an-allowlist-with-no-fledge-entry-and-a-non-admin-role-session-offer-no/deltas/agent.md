---
module: agent
change: req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no
---

# Delta — agent (REQ-agent-112 with the Fledge core builtins)

## Modified

### REQUIREMENT REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged. The catalog
may also include a Fledge command when the run's allowlist names one
(`fledge-<command>`, REQ-agent-501): `createTaskExecute` SHALL then load the
project's Fledge plugins the same way, and a run whose allowlist names no
`fledge-*` command (and without `includeDangerous`) SHALL NOT spawn fledge
(PLUGIN-3). Nor SHALL a non-ADMIN role session (without `includeDangerous`):
its catalog can offer no Fledge plugin command (ROLES-CHAT-2), so the ADMIN
check runs before discovery. A catalog built without Fledge discovery (the
default catalog, an allowlist naming no `fledge-*` command, a non-ADMIN role
session) SHALL offer no Fledge plugin command; the only `fledge-` tools in it
SHALL be the read-only Fledge core builtins `fledge-lanes-list` and
`fledge-lanes-validate` (PLUGIN-1, REQ-plugins-461), which spawn fledge only
when the model calls them.

Acceptance Criteria
- includeDangerous + code tier + allowlist: the first request offers `fledge-hello`; the model's call runs the fake fledge and the ToolResult succeeds with the plugin output.
- Default catalog: no Fledge plugin command (`fledge-<command>` from discovery, e.g. `fledge-hello`) is offered and none is registered; the only `fledge-` tools offered are the read-only Fledge core builtins `fledge-lanes-list` and `fledge-lanes-validate` (PLUGIN-1, REQ-plugins-461).
- Existing tool-loop tests pass unchanged.
- A default-catalog code-tier run with a fake fledge first on PATH offers `fledge-lanes-list` and `fledge-lanes-validate` and starts no fledge process (the fake records no call): the Fledge core builtins spawn fledge only when a tool call runs them.
- Allowlist `["fledge-hello"]` at code tier without includeDangerous: the first request offers `fledge-hello` and the model's call runs the fake fledge successfully.
- An allowlist naming only `github-pr-review`: fledge is never spawned; no Fledge plugin command (`fledge-hello`) is offered or registered, and the only `fledge-` tools offered are the read-only core builtins `fledge-lanes-list` and `fledge-lanes-validate`.
- A non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN=0`) with `fledge-hello` allowlisted never spawns fledge and offers or registers no Fledge plugin command; the only `fledge-` tools it offers are the read-only core builtins `fledge-lanes-list` and `fledge-lanes-validate` (read tools, ROLES-CHAT-2). The owner's ADMIN role session with the same allowlist discovers and offers `fledge-hello`.
