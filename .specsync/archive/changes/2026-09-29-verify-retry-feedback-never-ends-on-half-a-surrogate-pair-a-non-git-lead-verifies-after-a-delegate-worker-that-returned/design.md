---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: design
---

# Design

- `src/agent/verify.ts` `verifyFeedbackExcerpt`: `scanEnd` becomes `let`;
  when it is past `sectionStart` and lands on a low surrogate it moves back
  one, so the scanned slice never ends on the high half of a pair. The kept
  end of the log (`tailOf`) already refuses to start on a low surrogate and
  `capLine` already guards its own cut, so this closes the last cut. Output
  is unchanged for every input whose scan end is not inside a pair.
- `src/agent/execute.ts` tool loop: `delegate` is added to
  `unreportedEditTools` when a worker ran (`result.data` present; a refusal
  carries none) and either the run's allowlist names a Fledge plugin command
  (unchanged) or the data has no boolean `verified`. Every result frame
  carries `TaskResult.verified` and the delegate command copies it into its
  data only from a frame, so its absence means no frame was read: whatever
  the worker edited reached the lead nowhere. `runTask` then fails closed in
  a non-git project exactly as for a Fledge command (one `Verify gate: no git
  working tree to diff` note naming `delegate`). No new data field. A git
  project keeps the real diff, which sees the worker's edits anyway. A
  non-ADMIN role session is never offered `delegate` (mutating), so the
  role-session case does not arise.
- `plugins/github/commands.ts` `withAttribution`: the body counts as
  attributed only when it contains `ATTRIBUTION_MARKDOWN` or
  `ATTRIBUTION_PLAIN` (imported from `src/attribution.ts`, the one place the
  footer text lives). Otherwise the existing `\n\n---\n` + markdown footer is
  appended as before; no @handles.
- `src/cli.ts` `envPresent` trims, so doctor's `github` line agrees with
  `github-watch` (`src/doctor.ts` `present()`) and with WATCH. It is used
  only for that line.
- `plugins/github/api.ts` `getGithubToken`:
  `env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || undefined`, the same
  expression as WATCH's `resolveToken`. A blank `GITHUB_TOKEN` no longer
  shadows `GH_TOKEN`; blank-only gives the existing missing-token refusal in
  `createOctokit` before any request. `GITHUB_TOKEN` still wins when both are
  real.
