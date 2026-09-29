---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: requirements
---

# Requirements

- REQ-agent-002 (captured, AGENT-4.a): the excerpt is kept "in at most 4000
  chars and never cut inside a surrogate pair"; AC "The excerpt is never
  longer than its cap and never holds half a surrogate pair."
- AGENT-4 (`hi/agent.md`): "It does not tell me the job is done until the
  project's verify lane has passed, or it tells me plainly that verification
  failed." FLEDGE-2: the agent runs the project's verify lane when it
  finishes a change. REQ-agent-085 / REQ-agent-502: outside a git work tree a
  run that called a tool whose file edits no result reports verifies anyway.
- REQ-plugins-051 (captured): "github-pr-create SHALL append plain Made with
  Corvidinho markdown attribution when missing and SHALL NOT insert
  @handles."
- CLI-4 / REQ-cli-003 (captured): "A token or watch login SHALL count only
  when it is not blank, as the bridge and WATCH trim them"; AC "A blank
  (whitespace-only) Discord or GitHub token or watch login prints
  `[missing]`". REQ-plugins-003: the GitHub commands call Octokit with
  `GITHUB_TOKEN` / `GH_TOKEN`.
- Leif's 2026-09-28 interview (W12 seeds, no new criteria): one small fix and
  a fail-on-main test per record; kind bug-fix.
- Modified (deltas): REQ-agent-002 (one AC bullet), REQ-agent-502 (frameless
  worker sentence + AC bullet), REQ-plugins-003 (trimmed Octokit token + AC
  bullet), REQ-plugins-051 (exact attribution + AC bullet), REQ-cli-003
  (`github` line + AC bullet).
- No new REQ id, hi id, env var, config key, flag, command, data field or
  schema change.
