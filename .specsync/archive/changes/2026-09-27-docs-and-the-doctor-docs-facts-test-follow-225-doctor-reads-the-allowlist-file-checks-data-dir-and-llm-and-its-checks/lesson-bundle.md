# Lesson bundle — docs-and-the-doctor-docs-facts-test-follow-225-doctor-reads-the-allowlist-file-checks-data-dir-and-llm-and-its-checks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs and the doctor docs-facts test follow #225: doctor reads the allowlist file, checks data-dir and llm, and its checks live in src/doctor.ts
- **Kind**: Documentation
- **Paths**: docs/BOX-UPDATE.md, docs/DISCORD-GO-LIVE.md, tests/docs.operator-facts.test.ts
- **Acceptance**: docs/BOX-UPDATE.md and docs/DISCORD-GO-LIVE.md describe doctor as merged with #225 (allowlist file + env for discord and github-watch, deny wins, data-dir, llm warn, allowlist-file parse failure) and keep the refresh's .env note; tests/docs.operator-facts.test.ts finds every doctor check name in src/cli.ts or src/doctor.ts, including data-dir, and passes.

## Evidence

- Verification commit: `22b05aba682668d9200916b3e428e8d2a9440ea9`
- Base commit: `a0e27ae09119184dc2c2c48e71076f8f3c7aaf35`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

#229 (docs refresh) and #225 (doctor reads the allowlist file like the bridge and watch) both edited the doctor paragraphs in docs/BOX-UPDATE.md and docs/DISCORD-GO-LIVE.md. #225 merged first, so the refresh text that said doctor reads the environment only is now wrong. #225 also moved the discord, github-watch, llm and data-dir checks into src/doctor.ts, which broke the refresh docs-facts test that looked for check names only in src/cli.ts.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
