---
module: cli
change: release-0-0-16-daemon-157-web-fetch-148-fledge-plugins-as-tools-154-pr-diff-files-153-ci-by-ref-158-project
---

# Delta — cli (release 0.0.16)

## Added

### REQUIREMENT REQ-cli-017

The project SHALL ship package version `0.0.16` covering the headless daemon
(#157), SSRF-guarded web-fetch (#148), Fledge plugins as tools (#154), GitHub
PR diff/files (#153), CI status by ref (#158) and project instructions in the
prompt (#150). CLI `version` and Discord presence (DISCORD-12) report
`0.0.16` after a restart. CHANGELOG SHALL include verbose 0.0.16 notes with the
restart and allowlist steps. STATUS.md SHALL record the slices.

Acceptance Criteria
- `package.json` version is `0.0.16`.
- CLI `version` prints `0.0.16`.
- CHANGELOG has a 0.0.16 section that the updater's changelog helper extracts exactly.
- STATUS records #157, #148, #154, #153, #158 and #150.
