---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: docs
---

# Docs

- `docs/discord.md`: live-source argv is `task run --task <prompt> --output
  ndjson` (never `--no-verify`); new "Verification" paragraph under Session
  replies (Verified / Verification FAILED / No files changed).
- `docs/WATCH.md`: step 5 spawns `corvidinho task run` with the verify gate on.
- `fledge.toml` `[corvidinho]` comment: bridges never pass `--no-verify`; a run
  that changed files runs the verify lane; no-change chat says so plainly.
- `corvidinho --help`: `--no-verify` is operator-only and the result says NOT
  verified; bridges never pass it.
- Spec bodies: agent Public API / Invariants / scenario / error row; cli and
  discord invariants; watch dependencies.
- CHANGELOG / STATUS / version are left to the release PR.
