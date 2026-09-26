---
id: add-shared-made-with-corvidinho-attribution-constants-and-a-corvidinho-attribution-cli-command-without-account-handles
state: archived
type: feature
base_commit: 8609cc16f73198c35f4a17c4d8a775900561ff77
---

# Add shared Made with Corvidinho attribution constants and a corvidinho attribution CLI command without account handles

## Intent

Add shared Made with Corvidinho attribution constants and a corvidinho attribution CLI command without account handles

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- Shared markdown and plain attribution constants are exported; the attribution text contains no @ characters; corvidinho attribution prints the markdown footer and exits 0; unit tests cover both forms and CLI output; CLI spec documents the command; bun test, bunx tsc --noEmit, and specsync check --spec cli pass.

## No-spec Rationale

Not applicable
