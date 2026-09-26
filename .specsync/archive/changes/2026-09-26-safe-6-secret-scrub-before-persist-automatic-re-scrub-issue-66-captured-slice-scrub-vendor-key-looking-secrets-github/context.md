---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: context
---

# Context

Issue #66 (M1, P1). Sessions are durable since #61 and memory since #64, but
nothing scrubbed secrets before writing — users paste tokens into Discord
prompts and the agent summaries can echo them. `hi/safe.md` **SAFE-6** is
captured: "Secrets that look like vendor keys are scrubbed before sessions are
saved, and I can re-scrub history when rules tighten."

Draft **SAFE-10** (outbound Discord/AlgoChat replies, audit log, backups,
dashboard, Discord-admin re-scrub command) and Algorand mnemonics are NOT
captured — left for HI capture. The issue rules out a human CLI subcommand,
so the re-scrub is automatic: bump `SCRUB_RULES_VERSION` when rules tighten
and the next DB open re-scrubs stored rows once.
