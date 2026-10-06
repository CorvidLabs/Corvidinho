---
module: cli
change: release-0-0-42-land-wave-feature-ship-trust-verify-work-review-hi-drafts-nongit-doctor-init-schedule-stop-model
---

# Delta — cli (release 0.0.42)

## Added

### REQUIREMENT REQ-cli-434

The project SHALL ship package version `0.0.42` (land-wave feature ship after v0.0.41). CLI `version` and Discord presence (DISCORD-12) report `0.0.42` after a restart. CHANGELOG SHALL include verbose 0.0.42 notes covering #364 Trust verify, #365 /work second-model review, #367 hi drafts, #351 nongit AGENT-1, #368 doctor/init CLI-4, #369 schedule stop, #370 model escalate, #371 spend reserve AUTONOMY-8.a, #372 shell-exec SpecSync refuse, #373 SAFE-21.b, #374 IDENTITY-12.a GitHub roles, #375 AUTONOMY-10.b bridge-live note, #350 PLUGIN-5 toggles, #348 hi guard, and tip-orphans #376–#390.

Acceptance Criteria
- `package.json` version is `0.0.42`.
- CLI `version` prints `0.0.42`.
- CHANGELOG has a 0.0.42 section that the updater's changelog helper extracts exactly.
