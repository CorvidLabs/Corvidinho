---
change: add-shared-made-with-corvidinho-attribution-constants-and-a-corvidinho-attribution-cli-command-without-account-handles
artifact: testing
---

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
