---
hi-draft: 1
families: [AUTONOMY, AUTONOMOUS, AGENT]
owner: leif
status: confirmed-captured-see-hi
issue: 44
---

# AUTONOMY (draft) — clarify + ping when stuck

> **CAPTURED.** Leif confirmed; live criteria are in `hi/`. This file is historical provenance only.
> Issue: [#44](https://github.com/CorvidLabs/Corvidinho/issues/44). Keep building; do not silent-stub. #31 LLM loop remains critical path.

## Intent

When Corvidinho is stuck on missing intent or a human decision, it asks clarifying questions and pings Leif on Discord — instead of inventing an answer or going quiet. Soft single-agent path toward **AUTONOMOUS-7**, not the full multi-agent suite by default.

## Proposed criteria (for Leif)

- **AUTONOMY-1**  When a task cannot proceed without a human choice, the agent asks a clarifying question instead of inventing criteria or claiming done.
- **AUTONOMY-2**  When stuck beyond a threshold (or on explicit escalate), it pings the configured **owner** channel/DM on Discord (IDENTITY) rather than dying silently — aligns with **AUTONOMOUS-7**.
- **AUTONOMY-3**  Clarifying / owner questions can be recorded (MEMORY) so replies resume the same thread of intent.
- **AUTONOMY-4**  Full council/delegate/schedule suite (AUTONOMOUS-2..6) stays optional/off until separately enabled; this draft is the “not silent stub” loop first.

## Provenance (steal, do not invent)

corvid-agent: `owner-question-manager.ts`, MCP `tool-handlers/owner.ts` (`notify` / `ask_owner`), notifications Discord channel, `skills/owner-comms`. Existing `hi/autonomous.md` AUTONOMOUS-7. See #44 / closed #40.

## Non-goals

Credit/spend product; inventing `hi/` before confirm; replacing #31 prove-before-done.
