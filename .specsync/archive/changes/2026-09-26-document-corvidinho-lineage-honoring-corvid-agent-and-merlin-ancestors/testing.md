---
change: document-corvidinho-lineage-honoring-corvid-agent-and-merlin-ancestors
artifact: testing
---

# Testing

## Local

- `specsync check --force` exits 0
- `specsync change audit` exits 0
- `fledge lanes run verify --non-interactive` green

## CI (unchanged contract)

- **ci** smoke: Bun only
- **Spec Sync**: `CorvidLabs/spec-sync@v6` + change audit

## Rejection signal

ORIGIN.md trashes ancestors, omits the billing pause reason, or treats iced
desktop as Corvidinho’s primary shape.
