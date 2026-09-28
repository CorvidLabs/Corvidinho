---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: design
---

# Design

- **Catalog filter (`src/agent/tools.ts`).** `buildOpenAiTools` keeps its
  order of filters and changes only the danger check: a dangerous entry is
  kept when `includeDangerous` (test seam) or `allowlistOffers(allowlist,
  name)` — the exact name is in the allowlist and not in
  `SAFE3_PENDING_TOOLS` (`shell-exec`, `node-exec`, `python-exec`,
  `cargo-exec`). The role filter (non-ADMIN drops every mutating tool, and
  every dangerous tool is mutating), the SAFE-9 autonomous filter and the
  tier filter still run, so the allowlist can only add tools an ADMIN / local
  run at that tier may see.
- **Execute (`src/agent/execute.ts`).** `createTaskExecute` already resolved
  the run's allowlist (`opts.allowlist ?? allowlistFromEnv()`) for
  `runPlugin`; it now passes the same set to `buildOpenAiTools`. Fledge
  discovery (a `fledge` subprocess) runs when `includeDangerous` or the
  allowlist offers a `fledge-*` name; otherwise no spawn, as before. The tool
  loop records every offered tool it dispatched for which
  `editsFilesUnreported(name)` holds (origin `fledge:` or SAFE-3 pending) and
  returns the names as `unreportedEditTools` on the completion and soft-land
  results (abort, error and ask results never reach the gate).
- **Gate (`src/agent/loop.ts`).** `runTask` unions `unreportedEditTools`
  across attempts. With the gate on, no workspace tracker (non-git cwd or
  unreadable start snapshot), no file in `filesChanged` and a recorded name,
  it emits `Verify gate: no git working tree to diff, and <names> may have
  changed files no tool reported, so verifying anyway.` and verifies. In a
  git work tree the real diff already covers these tools (REQ-agent-085).
- **Callers.** No caller changes: `task run` (src/cli.ts) already passes
  `allowlistFromEnv()`; Discord / `/session start` / `/work` spawns inherit
  the bridge env; WATCH, schedules and council voices are non-ADMIN (no
  dangerous tool); a delegate worker gets the lead's effective allowlist and
  is non-ADMIN when the lead is in a role session.
- **Most conservative reading** (choices pending Leif): the allowlist is the
  only consent (no new key, interactive runs are not widened); the four
  SAFE-3-pending tools stay out even when listed; the non-git fail-closed
  is limited to tools that can edit files unreported, so GitHub / memory /
  Discord runs in a non-git session do not start a verify lane.
