---
change: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
artifact: context
---

# Context

Review of PR #191 (change github-plugin-repo-gate-reads-the-allowlist-file-…,
REQ-plugins-253) found a test-isolation regression. Since the GitHub plugin
gate (`checkRepoGateForActingRole`) now loads the allowlist file, tests that
expect "no env allow list ⇒ refused" read whatever file the machine has:
`CORVIDINHO_ALLOWLIST_FILE` or ~/.config/corvidinho/allowlist.toml|json.
`tests/preload.ts` isolated only `CORVIDINHO_DATA_DIR`.

Repro (merged tree 8129f4d, tokens unset, file `[github] orgs = ["corvidlabs"]`):
via `CORVIDINHO_ALLOWLIST_FILE` 2 failures
(tests/github.review.plugin.test.ts "empty repo allowlist refuses before any
API call", tests/github.write.plugin.test.ts "empty repo allowlist still
denies when command allowlisted"); via a temp HOME/.config/corvidinho/allowlist.toml
3 failures (plus tests/github.deny.cli.test.ts "empty allowlist denies repo",
which deleted `CORVIDINHO_ALLOWLIST_FILE` and so fell back to the home file).
On the bot VM the AGENT-4 verify runner and the /work verify spawn
`fledge lanes run verify` with the bridge env, so every bot-made Corvidinho
change would fail verify.

With a GitHub token set and the home file present, the pre-fix suite sent 2
requests to api.github.com (seen through a local refuse-all logging proxy):
the deny.cli "empty allowlist" spawn (gate now passed) and the deny.cli
"allowlisted repo reaches auth/API layer" spawn, which forwarded the caller's
token by design (pre-existing on main).

Review minor folded in: REQ-plugins-253 said "An unreadable file SHALL add
nothing (empty ⇒ deny)", but a malformed file only drops its own entries and
env overlays still apply (same as main and WATCH). No test covered that at the
plugin gate.
