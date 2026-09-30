---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: docs
---

# Docs

- `docs/discord.md`: the live-source paragraph says a passing lane is
  verified only when its test summary shows tests ran and no test was
  deleted, retitled or turned off (REQ-agent-185); the /work gate table gets
  the merge-base test row and the pre-push evidence (REQ-discord-185).
- `docs/DISCORD-GO-LIVE.md`: the /work PR step also needs a test summary and
  no dropped test since the branch left its base.
- `README.md`: the project's verify lane needs a test step whose summary
  Corvidinho recognises, or no change is ever "verified".
- Specs: `agent.spec.md` (files, Public API, invariant, two scenarios, three
  error rows), `discord.spec.md` (`tests-deleted`, invariant, two error
  rows), each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
