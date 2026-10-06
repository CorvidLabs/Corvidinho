---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: context
---

# Context

Issue #89 (AGENT-18, M3). AGENT-18 is captured on main from Leif's 2026-09-28 interview (round 3): "It works each repo's own way: a SpecSync change where the repo uses SpecSync; where it uses hi, it drafts criteria and asks before capturing, never inventing them; and Trust where the repo uses Trust." The SpecSync clause shipped in #329; the hi guard is #348 (landing separately); hi drafts are a later slice. This change builds only the Trust clause, so AGENT-18 stays partial.

Leif's #89 decision (2026-09-26): in other repos it follows that repo's own gates; Corvidinho's own repo keeps its "no Trust re-add" stance. So nothing Trust-related is added to Corvidinho (no `.trust.toml`, no Trust CI), and a repo without `.trust.toml` behaves exactly as today.

What was there before: `detectRepoWays` already found `.trust.toml` (as the union of the session base, HEAD and the working tree), the ways line said "its steps are not followed yet", no verify step ran Trust, and `.trust.toml` was not protected.

How fledge exposes Trust here: fledge 1.8.0 has no built-in `trust` subcommand (`fledge trust --help` answers `error: unrecognized subcommand 'trust'`), and `fledge plugins list` shows no Trust plugin on this machine. Trust ships as the fledge-trust plugin, whose README names `fledge trust verify`. The step therefore fails closed with the exact reason wherever `fledge trust` is not there. Tests use a stand-in fledge on PATH, never the host's.

No new hi capture: AGENT-18 is already on main.
