# Agent — testing

`tests/agent.loop.test.ts`, `tests/agent.config.test.ts`, `tests/agent.cli.test.ts`.
- `tests/autonomous.enabled.test.ts`: AUTONOMOUS-1 gate fixtures, SAFE-9 catalog
  hiding, ROLES-CHAT non-ADMIN / ADMIN catalogs, tool-loop delegate via a fake
  bin (REQ-agent-117).
- `tests/autonomous.council.test.ts`: council core with an in-process fake
  runner (phase order, concurrency <= 2, critique / chair prompts, failed
  voices, < 2 proposals, failed chair, scrub + caps, per-voice and council time
  caps, lead abort) and the tool loop offering / running `council` against a
  `.ts` fake bin (REQ-agent-118).

## Soft-land tool rounds (REQ-agent-312)

`tests/agent.soft-land.test.ts` covers exhaustion soft-land, chatBody scrub, and mention rewrite.

## Per-tier model (REQ-agent-079)

`tests/agent.tool-loop.test.ts` "per-tier model (AGENT-5, REQ-agent-079)":
fallback order, `--tier` override precedence, request `model` per tier, no
per-tier keys = unchanged, SAFE-8 pricing of an unpriced read model (the ask
names the key that set it), `modelKeyForTier` / `perTierModels`, and doctor /
`/status` spend lines that flag an unpriced per-tier model with its tier.
`tests/autonomous.delegate.test.ts`: a read-tier worker env resolves the read
model. `tests/cli.doctor-truth.test.ts` / `tests/agent.cli.test.ts`: doctor
`[ok] llm` per-tier line and help (REQ-cli-009).
## Real-diff verify gate (REQ-agent-085)

`tests/agent.loop.test.ts` "runTask verify gate uses the real git
working-tree diff (AGENT-4, REQ-agent-085)": temp git repos where an attempt
edits outside the file tools and reports `filesChanged: []` — failing lane
ends failed, passing lane ends done verified; new untracked file + deleted
file; same-size edit to an already-dirty file; commit through a shell; first
commit on an unborn HEAD; shell-only retry re-verified with feedback; cwd
subdirectory (cwd-relative paths, edits outside ignored); untouched pre-run
dirt, gitignored-only change and a non-git cwd still skip; an unreadable diff
fails closed; a 30000-path diff adds `WORKSPACE_DIFF_MAX_FILES` paths and the
streamed NDJSON result still parses; with the hash budget spent an untouched
dirty file stays quiet and an edit to it is caught; the gate off takes no
snapshot.
`tests/agent.tool-loop.test.ts` "runTask: a real code-tier shell-exec edit
reaches the verify gate": end to end through the real `shell-exec` plugin.
## Verify retry feedback (REQ-agent-002, AGENT-4.a)

`tests/agent.verify-feedback.test.ts`: `verifyFeedbackExcerpt` on a fledge
lane log shaped like Corvidinho's own (`tests/fixtures/verify-lane-log.ts`:
`lint` and a `--help` smoke over 4000 chars pass, then `test` fails) keeps the
failing step whole and drops the `--help` head; a failing step whose own
output is over the cap keeps its first error lines and the end of the log,
with no passing-test lines; console chatter that only mentions a failure
(the `chattyFailingLaneLog` fixture: Corvidinho's bun test stdout before its
stderr report) does not crowd out the failure's own lines; colour escapes are
dropped and hide no marker; a failing parallel step is named whole and kept
from its `Running parallel:` line; a log with no fledge markers keeps its end
and is not called a failing step's output; output within the cap is
unchanged; never over the cap and never half a surrogate pair. `tests/agent.loop.test.ts`: the retry's `verifyFeedback` from that log
names the failing test within 4000 chars; a short output arrives whole.
`tests/agent.tool-loop.test.ts`: the tool loop's retry request and the
read-tier chat carry the failing step, not the first 4000 chars.
## Images as image parts (REQ-agent-428, DISCORD-9)

`tests/agent.tool-loop.test.ts` ("files-read images reach the model as image
parts") — scripted fake `fetchImpl`: the round after a `files-read` of a PNG
carries the small tool message then one user message with an `image_url`
data URL; two images in a round share one user message; `ToolResult` detail
and ndjson never hold the base64; HTTP 400 on the image request retries once
with the note in the image's tool message (no user message after tool
messages) and completes, also against a provider that rejects that role
order; 404 / 413 / 415 / 422 fall back too, 401 / 429 / 500 do not; a refusal
drops earlier rounds' images too; a later image after a refusal gets the note
with no second retry; 400 on the retry, or with no image, stays an error.
