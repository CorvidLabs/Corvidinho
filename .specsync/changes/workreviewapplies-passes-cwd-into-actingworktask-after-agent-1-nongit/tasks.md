---
change: workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit
artifact: tasks
---

# Tasks

- [x] Add optional `cwd` arg to `workReviewApplies` (default `process.cwd()`)
- [x] Forward `cwd` into `actingWorkTask(env, cwd)`
- [x] Pass `taskRunIn`'s run `cwd` at the call site
- [x] Confirm `bunx tsc --noEmit` is clean
