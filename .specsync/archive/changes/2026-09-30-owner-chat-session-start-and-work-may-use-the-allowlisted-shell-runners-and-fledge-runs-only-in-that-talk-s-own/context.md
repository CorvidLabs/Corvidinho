---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: context
---

# Context

Issue #83 (M3, shell with the cwd clamped; tracker for SAFE-3) and milestone
#124 (M4 safe autonomy), slice safe3a-gate of the M3/M4 plan
(`/home/user/coord/pr-safe3a-gate.json`). SAFE-3.a is captured on main from
Leif's 2026-09-28 interview (round 2): "The model may use the shell, the
language runners and Fledge lane/task runs only in my own interactive runs
(chat, /session start, /work, local CLI), only when I allowlist them, and
only inside that talk's own worktree; non-owners, WATCH and schedules never
get them." Nothing new is captured in `hi/`.

What was true on main (507d97b): `SAFE3_PENDING_TOOLS` kept `shell-exec`,
`node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run` and
`fledge-run` out of every model catalog, whoever ran and wherever, so the
owner could not let the agent build or test in its own talk; only operator
`corvidinho plugins run` reached them. SAFE-3 (the clamp), SAFE-21 (the
foot-gun refusals) and SAFE-21.a (credential-free child env) shipped in
#309, and the must-ask gate (#319) classifies shell / runner / Fledge prod
and deploy commands.

This change is the Discord half of SAFE-3.a: the owner's chat,
`/session start`, `/work` and the ask answers that continue them. The
local CLI half (safe3a-cli) needs `task run` to have a per-run worktree
first, so a local run stays refused here; SAFE-3.a is therefore partly met.

Constraints: specs only through SpecSync; no new config key, flag, table or
schema bump; `runToolLoop`'s model-call code and `src/agent/providers.ts`
untouched (providers-3 in flight); #232 / #233 scope untouched; the shell
grant goes through `runPlugin`'s must-ask gate, never around it. Conservative
defaults come from the safe3a-shell rows of
`/home/user/coord/m34-defaults.md` and are listed in the PR under "Design
choices pending Leif".
