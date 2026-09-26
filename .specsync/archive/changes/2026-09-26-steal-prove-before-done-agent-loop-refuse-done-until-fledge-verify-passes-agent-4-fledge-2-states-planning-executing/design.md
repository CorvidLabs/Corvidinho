---
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
artifact: design
---

# Design

- Lean Merlin steal: Idle→Planning→Executing→Verifying→Done|Failed. No LLM yet; `execute` is an injectable step (tests + CLI demo).
- `verify_before_complete` + `max_retries` from `fledge.toml` `[corvidinho]` (Merlin field names; Corvidinho section). CLI `--no-verify` / `--max-retries` override.
- Default verify runner: `fledge lanes run verify --non-interactive` in project cwd. Injectable for unit tests.
- Verify only when flag on AND execute reports `filesChanged.length > 0` (Merlin want_verify). Empty changes → verify_skipped.
- Events: StateChanged, Text, VerifyResult. Cancellation: AbortSignal checked at state transitions and around verify spawn.
- No Trust/attest. No rollback-on-exhausted in this slice.
