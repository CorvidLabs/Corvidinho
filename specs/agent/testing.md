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

## Real-diff verify gate (REQ-agent-085)

`tests/agent.loop.test.ts` "runTask verify gate uses the real git
working-tree diff (AGENT-4, REQ-agent-085)": temp git repos where an attempt
edits outside the file tools and reports `filesChanged: []` — failing lane
ends failed, passing lane ends done verified; new untracked file + deleted
file; same-size edit to an already-dirty file; commit through a shell; first
commit on an unborn HEAD; shell-only retry re-verified with feedback; cwd
subdirectory (cwd-relative paths, edits outside ignored); untouched pre-run
dirt, gitignored-only change and a non-git cwd still skip; an unreadable diff
fails closed; the gate off takes no snapshot.
`tests/agent.tool-loop.test.ts` "runTask: a real code-tier shell-exec edit
reaches the verify gate": end to end through the real `shell-exec` plugin.
