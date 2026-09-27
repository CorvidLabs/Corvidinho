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

## Images as image parts (REQ-agent-428, DISCORD-9)

`tests/agent.tool-loop.test.ts` ("files-read images reach the model as image
parts") — scripted fake `fetchImpl`: the round after a `files-read` of a PNG
carries the small tool message then one user message with an `image_url`
data URL; two images in a round share one user message; `ToolResult` detail
and ndjson never hold the base64; HTTP 400 on the image request retries once
with the text note and completes; a later image after a refusal goes as the
note with no second retry; 400 on the retry, or with no image, stays an error.
