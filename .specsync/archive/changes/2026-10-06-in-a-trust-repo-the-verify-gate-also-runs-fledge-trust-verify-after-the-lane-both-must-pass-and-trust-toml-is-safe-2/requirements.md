---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: requirements
---

# Requirements

Captured criterion (already on main, not re-captured): AGENT-18 "It works each repo's own way: a SpecSync change where the repo uses SpecSync; where it uses hi, it drafts criteria and asks before capturing, never inventing them; and Trust where the repo uses Trust." This change builds the Trust clause; AGENT-18 stays partial (hi drafts are later work).

Observable outcomes (REQ-agent-525, REQ-plugins-525; deltas in `deltas/`):

- A repo with `.trust.toml` (session base, HEAD or working tree) is verified only when `fledge lanes run verify` and then `fledge trust verify` both pass.
- Where `fledge trust` is not available the verify fails closed with the exact reason, before the lane runs.
- A repo without `.trust.toml` runs the lane alone, with today's argv and output.
- `.trust.toml` is SAFE-2 protected (file tools refuse it, `git-commit` will not stage its deletion).
- Nothing Trust-related is added to Corvidinho's own repo.
