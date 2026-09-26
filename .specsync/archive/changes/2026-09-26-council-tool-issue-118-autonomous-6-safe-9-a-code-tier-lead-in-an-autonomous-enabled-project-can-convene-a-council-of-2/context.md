---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: context
---

# Context

Issue #118 asks for councils: several voices debate a big call. Leif chose it
in the planning interview. Captured HI for this slice:

- **AUTONOMOUS-6**  A council can deliberate in structured phases when a
  decision needs more than one voice.
- **AUTONOMOUS-1**  Autonomous mode is off until enabled in project config
  (the `[corvidinho.autonomous]` gate from #117 / PR #167).
- **SAFE-9**  Expensive cross-agent networking tools stay hidden until a
  session is allowed to use them, so small models cannot wander off starting
  councils unprompted.

Left for HI capture (not built): **AUTONOMOUS-11** (DRAFT), a council of
different models (Grok, Codex, others) that debates in rounds and hands back a
recommendation with a **confidence score**. This change ships no multi-model
routing and no confidence score; voices use the lead's provider.

Constraints a mid-flight session needs:

- This branch is stacked on PR #167 (`claude/autonomous-gate-delegate-117`),
  which adds the AUTONOMOUS-1 gate and the delegate core this change reuses.
  #167 was finalized and archived but not yet merged when this change started.
- Hot shared files stay untouched: the council needs no edit to
  `src/agent/execute.ts`, `src/agent/tools.ts` or `src/plugins/run.ts`. The
  `autonomous: true` flag from #167 already hides it (SAFE-9), and the
  `mutating: true` flag already keeps it from non-ADMIN sessions.
- No persistence: nothing is written to SQLite, so SCRUB_TARGETS does not
  change. Every voice text is still SAFE-6 scrubbed before it reaches the lead.
