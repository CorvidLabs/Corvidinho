---
id: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
state: draft
type: bug_fix
base_commit: bf9a5b20b2a13f77eb503567428ff5551321bc9c
---

# Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401

## Intent

Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401

## Affected Canonical Specs

- `cli`
- `discord`
- `watch`

## Acceptance Criteria

- plugins run with an unknown name (also fledge-*), a plugin handler that throws, discord bridge with an unusable data dir, and anything else main throws print one SAFE-6 scrubbed line plus a hint and exit non-zero (the error's own exitCode or 1), with no stack frame, code frame, Bun crash footer, library object dump or token value; --json keeps the {ok:false,error} shape on stdout; discord bridge whose gateway login is rejected exits 1 with 'discord login failed (401|403): check DISCORD_TOKEN'; discord register-commands failure is one line with the HTTP status; github watch stops with exit 1 and one clear line on a GitHub 401 instead of polling forever, other poll errors print one scrubbed line, and a 403 rate-limit still backs off (WATCH-RELIABILITY-3)

## No-spec Rationale

Not applicable
