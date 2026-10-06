---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: research
---

# Research

- `fledge --version` here: 1.8.0. `fledge trust --help` exits non-zero with `error: unrecognized subcommand 'trust'`; `fledge help` lists no `trust`; `fledge plugins list` shows no Trust plugin. In 1.8.0 a plugin command is reached with `fledge plugins run <command>`, and `fledge <plugin-command>` is unrecognized.
- The M3/M4 scope notes (fledge-trust README): `fledge trust verify` itself runs the lifecycle lane, SpecSync, Augur and Attest, and needs specsync, augur and attest installed. Running it after the lane runs the lane twice (accepted by the design default). Augur and Attest look at commit ranges; how they judge uncommitted worktree edits is unverified.
