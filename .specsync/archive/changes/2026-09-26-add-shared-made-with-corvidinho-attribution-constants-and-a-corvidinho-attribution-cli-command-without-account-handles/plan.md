---
change: add-shared-made-with-corvidinho-attribution-constants-and-a-corvidinho-attribution-cli-command-without-account-handles
artifact: plan
---

# Plan

1. Add `src/attribution.ts` with the canonical URL, markdown/plain constants,
   and a format selector.
2. Add the `attribution` CLI command and document it in the CLI spec.
3. Add unit coverage for exact strings, handle exclusion, and CLI output.
4. Run SpecSync, Bun tests, typecheck, and the repository verification lane.
