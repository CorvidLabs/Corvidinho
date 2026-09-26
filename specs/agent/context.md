# Agent — context

Merlin prove-before-done steal for Corvidinho bootstrap. HI: AGENT-3/4/4.a/8, FLEDGE-2/3.

Autonomous (issue #117): the AUTONOMOUS-1 switch lives in the project `fledge.toml`
(`[corvidinho.autonomous] enabled = true`); SAFE-9 hides autonomous extras
from the tool catalog otherwise. Worker depth / tier / fan-out caps are safety
defaults; draft AUTONOMOUS-10 is left for HI capture.

Councils (issue #118, AUTONOMOUS-6): `council` reuses the delegate core for
every voice; voices are read-tier advisers (non-ADMIN, empty allowlist).
Multi-model councils and a confidence score are draft AUTONOMOUS-11, left for
HI capture.
