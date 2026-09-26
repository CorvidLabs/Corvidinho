---
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
artifact: plan
---

# Plan

1. `src/agent/{types,config,verify,loop,index}.ts` — states/events, fledge.toml `[corvidinho]` config, injectable verify runner, runTask loop
2. CLI `task run` + `--no-verify` / `--max-retries` / `--json`
3. `fledge.toml` `[corvidinho] verify_before_complete = true`, `max_retries = 3`
4. Specs: new `specs/agent/` + cli delta; register in SpecSync
5. Unit tests with mock verify (pass/fail/retry/cancel/skip); CLI smoke
6. SpecSync check + local fledge verify; draft PR linked to #7; merge when CI green
