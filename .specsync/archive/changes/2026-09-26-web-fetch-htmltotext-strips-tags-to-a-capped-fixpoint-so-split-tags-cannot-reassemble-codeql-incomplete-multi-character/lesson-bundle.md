# Lesson bundle — web-fetch-htmltotext-strips-tags-to-a-capped-fixpoint-so-split-tags-cannot-reassemble-codeql-incomplete-multi-character

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Web-fetch htmlToText strips tags to a capped fixpoint so split tags cannot reassemble (CodeQL incomplete multi-character sanitization on #148)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/web/text.ts, tests/web.fetch.test.ts
- **Acceptance**: split/nested tags never reassemble into markup; deeply nested hostile markup stays linear and tag-free

## Evidence

- Verification commit: `04c7cd21b342207d314a3b9fef01089fb2718bbf`
- Base commit: `254350444f30d45e68618de9c38276f6ff4eaba4`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

CodeQL (js/incomplete-multi-character-sanitization) flagged `htmlToText` on #148: one `replace(/<[^<>]*>/g, "")` pass lets split tags such as `<<b>script>` reassemble. Output is plain text for the model, but the sanitizer should be complete.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-111` | `tests/web.fetch.test.ts` | split tags never reassemble; 200k-deep nesting finishes under 2s with no tag left. |

## Where these lessons go

- `specs/plugins/context.md`
