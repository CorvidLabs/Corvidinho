---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: context
---

# Context

HI: CLI-4 (hi/cli.md) — "`init` and `doctor` tell me what is missing
(keys, Fledge, SpecSync, project files) in plain language instead of failing
later mid-task."

Gap on main (b89018f): `corvidinho doctor` checks keys (Discord, GitHub,
WATCH, LLM), `fledge` / `specsync` on PATH, plugins, the allowlist file,
owner, the data dir and spend, but nothing about project files. Run in a dir
with no `fledge.toml`, `.specsync/` or `specs/`, it says nothing about
them, although `task run`'s prove-before-done gate runs
`fledge lanes run verify --non-interactive` in that dir (AGENT-4) and fails
there after the model has done the work. `corvidinho init` prints
`Unknown command: init` and exits 1.

`init` is named in the captured text, so a report-only `init` adds no
invented surface; scaffolding files stays out of scope. No open issue tracks
CLI-4.

Constraints: no new flag, env var, config key or slash command; no SQLite
schema or package version change; the existing doctor lines are unchanged
(`fledge` / `specsync` lines moved into a shared helper with the same
text). Commands named as creators were checked against the installed tools
(fledge 1.8.0: `fledge run --init` writes fledge.toml; specsync 6.0.0:
`specsync init` writes .specsync/, `specsync generate` scaffolds specs/).
No Fledge or SpecSync command creates a verify lane with spec-check
(`fledge lanes init` adds only `ci` / `check`), so that line says what to add.
