---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: docs
---

# Docs

- `STATUS.md`: the Trust row says Trust is not used in Corvidinho's own repo (no `.trust.toml`; AGENTS.md "No Trust re-add on this bootstrap") and is followed where a repo has it.
- `docs/discord.md`: `discord-send-file`'s refused SAFE-2 list names `.trust.toml` (made after #366 archived #348's change, whose exact delivery input this file was).
- Living specs: `specs/agent/{agent.spec.md,requirements.md,testing.md}` (REQ-agent-525; the new test in the agent spec's files), `specs/plugins/{plugins.spec.md,requirements.md,testing.md}` (REQ-plugins-525).
- No CHANGELOG or version bump in this change (the release PR does that). No new operator env or config.
