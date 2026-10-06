---
id: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
state: verifying
type: feature
base_commit: 25723fe248a307e5ab67e105525e257b2f0d6c71
---

# In a Trust repo the verify gate also runs fledge trust verify after the lane, both must pass, and .trust.toml is SAFE-2 protected (AGENT-18 Trust clause)

## Intent

In a Trust repo the verify gate also runs fledge trust verify after the lane, both must pass, and .trust.toml is SAFE-2 protected (AGENT-18 Trust clause)

## Affected Canonical Specs

- `agent`
- `plugins`

## Acceptance Criteria

- AGENT-18 (captured on main from Leif's 2026-09-28 interview; this builds its Trust clause only): in a repo with .trust.toml in the session base, HEAD or the working tree, the default verify runner runs fledge trust verify after fledge lanes run verify passes, and the run is verified only when both pass; when this fledge has no trust command it fails closed with the exact reason before the lane runs; a repo without .trust.toml runs the lane alone exactly as before; .trust.toml is SAFE-2 protected (files-write/edit/delete refuse it, git-commit refuses to stage its deletion); nothing Trust-related is added to Corvidinho's own repo.

## No-spec Rationale

Not applicable
