---
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
artifact: context
---

# Context

Issue #7 STEAL: Merlin prove-before-done / verify-before-complete (AGENT-4 / FLEDGE-2 / AGENT-8).
Main tip already has plugin host (#6/#4 via PR #15). This slice adds the agent task-completion gate only.

Constraints: Linux Bun/TS; no Trust/attest; no ACCESS/bounty/MainNet; WATCH/chat hot path stays `--no-verify` (latency); real code-task completion must pass `fledge lanes run verify --non-interactive`. SpecSync gated in CI separately — not inventing Fledge-in-Actions.

Provenance: Merlin `docs/book/src/architecture/agent-loop.md`, `agent.rs` Verifying, `[merlin] verify_before_complete` / `max_retries`.
