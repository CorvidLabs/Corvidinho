---
module: agent
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
---

# Delta — agent (Fledge core runs wait on SAFE-3; core names start no discovery)

## Modified

### REQUIREMENT REQ-agent-501

Allowlisted dangerous tools in the task-run catalog (CLI-3 / SAFE-1,
GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3). `buildOpenAiTools` SHALL take an optional
`allowlist` and SHALL offer a dangerous plugin only when that allowlist names
it (exact name) or `includeDangerous` is set (a test seam no product caller
sets). `createTaskExecute` SHALL pass the run's effective allowlist (its
`allowlist` option, else `CORVIDINHO_ALLOWLIST`, which `task run` passes), so
for every `task run` (local CLI, Discord, `/session start`, `/work`,
schedules, WATCH, delegate workers) a dangerous plugin enters the model's
catalog only when the operator allowlisted it; an unlisted dangerous plugin
stays out and a call to it is refused as not offered (REQ-agent-128).
`shell-exec`, `node-exec`, `python-exec`, `cargo-exec` and the Fledge core
runs `fledge-lanes-run` and `fledge-run` (PLUGIN-1, REQ-plugins-461)
(`SAFE3_PENDING_TOOLS`) SHALL NOT be offered from the allowlist, even when
named, until the SAFE-3 decision on the shell and runners is taken: each
starts in the project dir, which is not a clamp, and a Fledge lane or task
runs whatever commands the project gives it. They still run through
`corvidinho plugins run`. The tier filter (`minTier`), the
ROLES-CHAT-2 role filter (a non-ADMIN role session gets no dangerous or
mutating tool, whatever the allowlist), the SAFE-9 autonomous filter,
catalog-only dispatch and the SAFE-1 / SAFE-4 / SAFE-5 / GITHUB-6 runtime
gates in `runPlugin` and the handlers SHALL be unchanged. With an empty
allowlist the catalog SHALL be exactly as before. No env var, config key,
flag, slash command or schema is added.

Acceptance Criteria
- At tool tier, an allowlist naming `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review`, `memory-forget` and `memory-override` offers all six; `danger-ping`, `web-fetch` and `discord-post-message` (dangerous, not named) are not offered; with no allowlist no dangerous plugin is offered.
- Every dangerous tool offered at tool or code tier is one the allowlist names.
- `files-delete` allowlisted is offered at code tier and not at tool tier.
- An allowlist naming `shell-exec`, `node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run`, `fledge-run` and `files-delete` at code tier offers `files-delete` and none of the six; `fledge-lanes-run` and `fledge-run` are registered, dangerous, offered by `includeDangerous` at code tier, and `editsFilesUnreported` names them.
- A code-tier task run whose allowlist names the four Fledge core builtins offers only `fledge-lanes-list` and `fledge-lanes-validate` as `fledge-` tools; the model's call to `fledge-run` is refused as not offered, no fledge process starts and `unreportedEditTools` is absent.
- `actingIsAdmin: false` with every dangerous plugin allowlisted offers no dangerous or mutating tool.
- `task run` path (`createTaskExecute` without an `allowlist` option, non-interactive, GitHub dry run): with `CORVIDINHO_ALLOWLIST=github-pr-review` the model is offered `github-pr-review`, its call succeeds as a dry run, and its call to the unlisted `github-issue-create` is refused as not offered.
- An ADMIN role session (owner) with that allowlist is offered and runs `github-pr-review`; a non-ADMIN role session with the same allowlist is not offered it and no call succeeds.

### REQUIREMENT REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged. The catalog
may also include a Fledge plugin command when the run's allowlist names one
(`fledge-<command>`, REQ-agent-501): `createTaskExecute` SHALL then load the
project's Fledge plugins the same way. A run whose allowlist names no Fledge
plugin command (and without `includeDangerous`) SHALL NOT spawn fledge
(PLUGIN-3); the four Fledge core builtins (`fledge-lanes-list`,
`fledge-lanes-validate`, `fledge-lanes-run`, `fledge-run`, PLUGIN-1) are
registered with the other builtins, so naming them starts no discovery. Nor
SHALL a non-ADMIN role session (without `includeDangerous`) spawn fledge: its
catalog can offer no Fledge plugin command (ROLES-CHAT-2), so the ADMIN check
runs before discovery. A catalog built without Fledge discovery (the default
catalog, an allowlist naming no Fledge plugin command, a non-ADMIN role
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
- An allowlist naming only the four Fledge core builtins: fledge is never spawned and `fledge-hello` is neither offered nor registered.
- A non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN=0`) with `fledge-hello` allowlisted never spawns fledge and offers or registers no Fledge plugin command; the only `fledge-` tools it offers are the read-only core builtins `fledge-lanes-list` and `fledge-lanes-validate` (read tools, ROLES-CHAT-2). The owner's ADMIN role session with the same allowlist discovers and offers `fledge-hello`.
