---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: requirements
---

# Requirements

- SAFE-21 (captured, `hi/safe.md`): "The shell refuses foot-guns (sed -i or >
  edits, piping downloads into a shell, deleting outside the worktree, reading
  secrets) and says why."
- SAFE-21.a (captured): "The shell and language runners start without my
  GitHub or git credentials, so pushes, PRs and merges only happen through the
  checked GitHub tools."
- SAFE-21.b (captured in this PR with `hi`, Leif's 2026-09-28 interview,
  round 16 on 2026-10-06): "The verify lane, the shell and the runners start
  without my cloud credentials (KUBECONFIG, AWS, Google Cloud, Azure and
  similar), so they can't reach prod by accident."
- Surfaces: the verify lane (runTask's `defaultVerifyRunner`), `shell-exec`,
  `node-exec` / `python-exec` / `cargo-exec`, and `fledge-lanes-run` /
  `fledge-run` (a model-run lane is the verify lane; they already share the
  runners' env under SAFE-21.a).
- Kept: SAFE-6 verify-lane scrub, SAFE-21.a git / GitHub scrub, SAFE-21
  refusals, SAFE-3 clamp, SAFE-3.a grant, AUTONOMY-9 must-ask for prod
  commands.
- Added: REQ-agent-621 (the cloud scrub and the verify lane),
  REQ-plugins-621 (shell, runners, Fledge core runs). Modified: REQ-agent-002
  (the default runner's env is no longer "every other inherited key").
- No new env var, config key, slash command, table or schema version.
