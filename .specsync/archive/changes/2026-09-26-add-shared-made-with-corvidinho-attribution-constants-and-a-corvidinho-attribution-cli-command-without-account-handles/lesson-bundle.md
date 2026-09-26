# Lesson bundle — add-shared-made-with-corvidinho-attribution-constants-and-a-corvidinho-attribution-cli-command-without-account-handles

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Add shared Made with Corvidinho attribution constants and a corvidinho attribution CLI command without account handles
- **Kind**: Feature
- **Specs**: cli
- **Paths**: src/attribution.ts, src/cli.ts, tests/attribution.test.ts, specs/cli/cli.spec.md
- **Acceptance**: Shared markdown and plain attribution constants are exported; the attribution text contains no @ characters; corvidinho attribution prints the markdown footer and exits 0; unit tests cover both forms and CLI output; CLI spec documents the command; bun test, bunx tsc --noEmit, and specsync check --spec cli pass.

## Evidence

- Verification commit: `4fc555e9f4b95cc3c2ff6f6f25661ba8030b9155`
- Base commit: `8609cc16f73198c35f4a17c4d8a775900561ff77`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Issue #20 requires Corvidinho-authored PR bodies to carry one consistent
attribution footer. The repository currently has no PR-body formatter or write
helper, so this change provides the shared forms and a safe CLI surface for
future callers. The footer must use only the project name and repository link,
never an account handle.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-1` | `tests/attribution.test.ts` | Exact markdown/plain forms and no `@` character assertions pass locally. |
| `REQ-cli-2` | `tests/attribution.test.ts` | CLI subprocess prints the exact markdown footer and exits 0 locally. |

## Automated coverage

- `bun test` — 66 passed, 1 optional live test skipped.
- `bunx tsc --noEmit` — passed.
- `bun src/cli.ts attribution` — prints the canonical markdown footer.
- `specsync check --spec cli` — passed with the repository's existing draft-spec warning.

## Where these lessons go

- `specs/cli/context.md`
