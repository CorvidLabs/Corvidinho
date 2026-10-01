---
module: agent
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
---

# Delta: agent (the [corvidinho.plugins] extras switch: /work and /schedule can be turned off, on by default — PLUGIN-5 / PLUGIN-5.a)

## Added

### REQUIREMENT REQ-agent-157

PLUGIN-5 / PLUGIN-5.a: `loadExtrasToggles({ installRoot, env?, home? })`
(`src/autonomous/enabled.ts`) SHALL say whether each extra — `work` (`/work`)
and `schedule` (`/schedule` and the scheduler's runs) — is on, from a
`[corvidinho.plugins]` table read fresh on every call (never cached) in two
places:

- the install root's `fledge.toml` (`<installRoot>/fledge.toml`, the
  bridge's / daemon's working directory), and
- the owner's allowlist file (`resolveAllowlistPath(env, home)`; TOML, or a
  `corvidinho.plugins` object in a `.json` file), which the box updater
  never resets.

Rules:
- Off in either place SHALL be off (`{ on: false, reason: "off", offIn }`,
  naming `fledge.toml` and/or `allowlist file`).
- A missing file, table or key SHALL be on, so an existing install stays on
  until the owner turns an extra off; otherwise only the literal `true` is
  on and `false` or any other value is off.
- `plugins.work = false` and `plugins = { work = false }` under
  `[corvidinho]` SHALL be the same key; a key under a later table SHALL
  not count; a key written twice SHALL be off unless every copy is `true`.
- A file that exists but cannot be read (any error but ENOENT), or a
  `.json` allowlist file that does not parse, SHALL make both extras off
  with `reason: "config-unreadable"` and an `error` naming the source (no
  path, no contents); callers log it.
- Target projects' `fledge.toml` files SHALL NOT be read, and
  `[corvidinho.autonomous]` SHALL have no say (`parseAutonomousConfig`
  keeps its behaviour, now on the shared `scanTomlKeys` scrape).
- `trackExtraState(read, onChange)` SHALL call `onChange` on the first read
  and on each change of state or reason only.

Acceptance Criteria
- `[corvidinho.plugins]` with `work = true` / `schedule = true` or no key is on; `false`, `"false"`, `"true"`, `0`, `1`, an inline table and `no` are off; `plugins.work = false` and `plugins = { work = false, schedule = true }` under `[corvidinho]` read the same; a key under a later `[tasks.test]` / `[[lanes.x]]` table, under `[merlin.plugins]` or named `council` does not count.
- No files, this checkout's own `fledge.toml` and no default allowlist file under the home dir give both on; `work = false` in the install root's `fledge.toml` gives `{ on: false, reason: "off", offIn: ["fledge.toml"] }`; `schedule = false` in the allowlist file beats `schedule = true` in `fledge.toml`; a `.json` allowlist file's `corvidinho.plugins.work: false` and the default allowlist path under the home dir are read.
- A `fledge.toml` that is a directory gives both `{ on: false, reason: "config-unreadable", error: "the install's fledge.toml could not be read (EISDIR)" }`; a `.json` allowlist file `{oops` gives `the allowlist file could not be parsed`.
- `[corvidinho.autonomous] enabled = false` leaves both on.
- Fixture: `tests/plugins.extras-toggle.test.ts`.
