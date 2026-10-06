---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: context
---

# Context

HI: CLI-4 (hi/cli.md, captured on main, confirmed by Leif) — "`init` and
`doctor` tell me what is missing (keys, Fledge, SpecSync, project files) in
plain language instead of failing later mid-task." No new hi capture: the
acceptance below is the W13 design decision Leif confirmed in the
2026-09-28 interview record (/home/user/coord/interview-2026-09-28.md).

Gap on main (8bf4422): doctor / init check `fledge.toml`, a verify lane with
spec-check, `.specsync/` and `specs/` (REQ-cli-430), but never that the
verify lane reaches a test step whose summary Corvidinho reads. Under
AGENT-15 (REQ-agent-185) a passing lane with no recognised test summary
fails closed (`Verify gate: not verified`), so such a project gets a clean
doctor / init and then fails every file-changing run — after the model has
done the work, the "failing later mid-task" CLI-4 rules out. README.md
already listed the test step as a requirement and said doctor does not
check it.

Constraints: no new flag, env var, config key or slash command; no schema
or package version change; existing doctor / init lines unchanged; file
contents and parser messages never printed (SAFE-6); nothing created.
#232 / #233 scope untouched.
