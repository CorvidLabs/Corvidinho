---
module: agent
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
---

# Delta — agent (run summaries scrubbed before every clip)

## Added

### REQUIREMENT REQ-agent-232

The run-summary helpers in `src/agent/task-summary.ts`
(`chatBodyFromTaskResult`, `summarizeTaskResult`, `summarizeTaskRunOutput`,
`chatBodyFromTaskRunOutput`) SHALL pass the result summary, the non-frame
stdout and the stderr fallback through the SAFE-6 scrubber (`scrubSecrets`)
before clipping them to their caps (1800 chars for the summary and stdout, 500
for stderr). A clip must never cut a secret into a shape the scrubber no longer
recognises (a vendor token cut below its minimum length, a private key without
its END line). `--json` stdout SHALL still be parsed from the raw text, and
only the extracted summary is scrubbed. `resultFrame` in
`src/agent/events-ndjson.ts` SHALL scrub an over-long `summary` before capping
it at `NDJSON_LIMITS.resultSummary` (4000 chars). A summary within the cap is
carried unchanged, as with `--json`. Every reader of a spawned run through
`collectTaskRunStream` (WATCH thread comments REQ-watch-231, Discord replies
REQ-discord-073, delegate worker summaries) therefore gets text that was
scrubbed before any clip. Text with no secret SHALL come out exactly as before
(SAFE-6; AGENTS.md Secrets).

Acceptance Criteria
- A `ghp_` token straddling char 500 of the stderr fallback, or char 1800 of non-frame stdout or of the result summary, comes out as `[redacted:github-token]` with no `ghp_` prefix.
- A PEM private key that starts before the 1800-char chat body cap or the 4000-char result frame cap and ends after it leaves no header or key body in the chat body, the result frame, or the WATCH comment and spawn log.
- Token-free summaries, stdout and stderr are trimmed and clipped exactly as before; a result frame within the cap carries the same TaskResult object.
- Fixture tests use runtime-built fake secrets and no network.
