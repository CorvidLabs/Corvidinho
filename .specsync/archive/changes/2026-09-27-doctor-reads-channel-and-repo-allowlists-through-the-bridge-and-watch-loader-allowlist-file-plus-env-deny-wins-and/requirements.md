---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: requirements
---

# Requirements

- CLI-4 (captured, `hi/cli.md`): doctor tells the operator what is missing
  (keys, …) in plain language instead of failing later mid-task. A doctor that
  reports a working allowlist as missing, or stays silent about a missing key
  or an unusable data dir, breaks it.
- ALLOW-1..4 (captured, `hi/allow.md`): allowlists load from the bot-VM
  config file and/or env; default-deny; deny wins (existing loader and gates).
  Doctor uses that loader and those gates, it does not define new rules.
- Modify REQ-cli-003 (delta `deltas/cli.md`): allowlists through the
  bridge / WATCH loader with source named and deny winning; `llm` line
  (`[warn]` demo stub, never fails doctor); `data-dir` line (`[ok]` /
  `[info]` / `[fail]`, doctor does not create it).
- REQ-cli-042 (owner, admin-lists, allowlist-file lines) is unchanged.
- No new REQ, command, flag, env var or package version.
