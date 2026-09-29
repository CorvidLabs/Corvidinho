---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: research
---

# Research

- Source: `/home/user/coord/w12.json` surviving records
  `verify-feedback-lone-surrogate`, `delegate-lost-result-nongit-done`,
  `github-pr-create-attribution-substring`, `doctor-github-blank-token-ok`
  (all severity minor, observed on `246cb6c`); interview design call: one
  small fix plus a fail-on-main test per record, drop any that does not
  reproduce on current main.
- Surrogate: sweeping 61 noise-line counts after a 20-emoji `error:` line
  (caps 3946 and 4000) gave 3 lone-surrogate outputs on `5366fff`, 0 after
  the fix.
- Delegate: `parseFrame` accepts a `result` frame with any `summary` and
  `state`; `task run --json` always writes `TaskResult.verified` (boolean).
  `runDelegateChild` copies `verified` / `verifySkipped` only from a frame,
  and the delegate command copies them into its data only when defined. A
  pre-worker refusal (`refuse()`) returns no data, and a handler throw is
  caught by the tool loop with no data.
- Tokens: WATCH (`src/watch/config.ts` `resolveToken`) and doctor's
  `github-watch` (`src/doctor.ts` `present`) already trim; only `src/cli.ts`
  `envPresent` and `plugins/github/api.ts` `getGithubToken` did not.
  `envPresent` has one caller (the `github` line).
- Attribution: `src/attribution.ts` holds the only two footer forms; WATCH
  ack/summary build their own bodies with `attribution()` and are not
  affected.
