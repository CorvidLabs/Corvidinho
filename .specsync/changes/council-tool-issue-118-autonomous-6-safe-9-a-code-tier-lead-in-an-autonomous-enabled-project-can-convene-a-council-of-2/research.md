---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: research
---

# Research

- corvid-agent `server/councils/discussion.ts` / `synthesis.ts` (the issue's
  "steal from" source) runs respond, then N discussion rounds, then review,
  then a chairman synthesis. Taken: independent first answers, one round
  where members see each other's answers, and a chair synthesis. Not taken:
  multiple discussion rounds, governance voting and reputation-weighted
  quorum (issue non-goals), and the confidence score (draft AUTONOMOUS-11).
- Corvidinho #167 delegate core: `runDelegateChild` already spawns a child
  `task run` with safe argv/env, depth, timeout/abort/exit cleanup and
  scrubbed summaries, so each voice is one delegate-core run.
- `collectTaskRunStream` builds `summary` with `summarizeTaskResult`, which
  prefixes a status line and cuts at 1800 chars. The raw result summary is
  better for quoting voices, hence `resultText`.
- ROLES-CHAT (#165): a role session with `CORVIDINHO_ACTING_IS_ADMIN=0`
  hides and refuses mutating tools at catalog and run time. That is the
  simplest way to make voices read/chat only at any tier.
- SAFE-1: `task run` takes the plugin allowlist only from
  `CORVIDINHO_ALLOWLIST`. Empty means every dangerous tool is denied in a
  non-interactive run.
