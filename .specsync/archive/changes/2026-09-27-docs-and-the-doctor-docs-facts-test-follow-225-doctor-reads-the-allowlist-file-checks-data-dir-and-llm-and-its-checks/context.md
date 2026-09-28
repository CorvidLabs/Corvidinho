---
change: docs-and-the-doctor-docs-facts-test-follow-225-doctor-reads-the-allowlist-file-checks-data-dir-and-llm-and-its-checks
artifact: context
---

# Context

#229 (docs refresh) and #225 (doctor reads the allowlist file like the bridge and watch) both edited the doctor paragraphs in docs/BOX-UPDATE.md and docs/DISCORD-GO-LIVE.md. #225 merged first, so the refresh text that said doctor reads the environment only is now wrong. #225 also moved the discord, github-watch, llm and data-dir checks into src/doctor.ts, which broke the refresh docs-facts test that looked for check names only in src/cli.ts.
