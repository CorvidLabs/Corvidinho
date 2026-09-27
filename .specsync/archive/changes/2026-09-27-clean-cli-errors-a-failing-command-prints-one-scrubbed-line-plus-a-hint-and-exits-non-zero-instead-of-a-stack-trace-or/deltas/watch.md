---
module: watch
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
---

# Delta — watch (stop on GitHub 401; one-line poll errors)

## Added

### REQUIREMENT REQ-watch-418

A GitHub 401 (bad or revoked token) SHALL stop the WATCH poll loop instead of
polling forever, and poll errors SHALL be one clear line (CLI-4, SAFE-6).
The 403/429 rate-limit backoff (WATCH-RELIABILITY-3) is unchanged.

- When a poll in the loop throws an error whose `status` (or
  `response.status`) is 401, the poller SHALL stop re-arming the loop, log one
  line `[watch] github auth failed (401): <line> — check GITHUB_TOKEN /
  GH_TOKEN; watch stopped` (`<line>` = `formatErrorLine`, REQ-discord-417),
  and settle `StartWatchResult.fatal` with `{ exitCode: 1, message }`.
  `fatal` SHALL never settle otherwise. A direct `pollOnce()` caller still
  gets the error thrown.
- The default error sink SHALL print `<msg>: <formatErrorLine(err)>` as one
  string and SHALL NOT pass the error object to `console.error`.
- Any other poll error keeps polling at the configured interval.

Acceptance Criteria
- A poll that throws an Octokit-shaped 401 settles `fatal` with `exitCode` 1 and the exact line above, the error sink receives only that line (no error object), the token value is absent, and a later `pollOnce()` fetches nothing.
- With the default sink, a poll that throws a 500 prints exactly one string `[watch] pollOnce error: <scrubbed first line>`.
- A 403 rate limit with `retry-after: 120` still backs off about 120 s and does not settle `fatal`.
- `corvidinho github watch` with a token GitHub rejects exits 1 by itself with that line and no `HttpError` dump.
