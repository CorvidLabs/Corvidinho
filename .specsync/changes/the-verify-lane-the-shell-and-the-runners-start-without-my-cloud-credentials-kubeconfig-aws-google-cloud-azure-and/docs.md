---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md`: the `fledge-lanes-run` / `fledge-run`,
  `shell-exec` and runner rows name SAFE-21.b; the SAFE-3.a paragraph's
  credential-free env names it; a new **No cloud credentials (SAFE-21.b)**
  note under the table lists what is dropped, the stand-ins, what is kept and
  the known limits.
- Specs: `specs/agent/agent.spec.md` (verify runner env prose, the new cloud
  scrub, files list gains `tests/agent.cloud-credentials.test.ts`),
  `specs/plugins/plugins.spec.md` (SAFE-21.b paragraph after SAFE-21.a; the
  runners paragraph), and both modules' `testing.md`.
- `hi/safe.md` / `INTENT.md`: SAFE-21.b captured with `hi` (separate commit).
- No README, CHANGELOG, STATUS or package.json edit: no new knob, and the
  release PR writes the rest.
