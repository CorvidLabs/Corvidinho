---
module: plugins
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
---

# Delta — plugins (.trust.toml is SAFE-2 protected (AGENT-18 Trust clause))

## Added

### REQUIREMENT REQ-plugins-525

`.trust.toml` is SAFE-2 protected like `fledge.toml` (AGENT-18 Trust clause,
REQ-agent-525): in a repo that has it the verify gate also runs `fledge trust
verify`, so a run must not rewrite or delete the Trust config it is verified
by. `isProtectedPath` SHALL be true for any path whose basename is
`.trust.toml` (any directory, any letter case), so `files-write`,
`files-edit` and `files-delete` refuse it with the SAFE-2 refusal (exit 2,
no override; its list now reads `(.env* / .git / fledge.toml / .fledge /
.trust.toml / bunfig.toml / specs / *.spec.md / .specsync / keystores)`),
checked on the path as given and where it resolves; `git-commit` SHALL
refuse to stage its deletion, and `discord-send-file` (which checks
`isProtectedPath`) SHALL never attach it. Reads stay allowed, and
`trust.toml`, `.trust.toml.bak` or `docs/trust.md` are not protected.
Corvidinho's own repo has no `.trust.toml`.

Acceptance Criteria
- `isProtectedPath` is true for `.trust.toml`, `./.trust.toml`, `pkg/.Trust.TOML` and an absolute path under the root, and false for `trust.toml`, `docs/trust.md` and `.trust.toml.bak`.
- `files-write` (relative, `./`, absolute, a new `sub/.trust.toml`), `files-edit` and an allowlisted `files-delete` of `.trust.toml` are refused with `refused (SAFE-2)` naming `.trust.toml` (exit 2); the file is unchanged and nothing is created; `files-read .trust.toml` and `files-write trust.toml` work.
- `git-commit` of a deleted tracked `.trust.toml` is refused (exit 2, SAFE-2); it stays in `ls-files` and nothing is staged.
- `discord-send-file`'s `fileAttachment` of `.trust.toml` is refused with `refused (SAFE-2)`.
- `tests/agent.trust-verify.test.ts` fails on the base sources and passes after.
