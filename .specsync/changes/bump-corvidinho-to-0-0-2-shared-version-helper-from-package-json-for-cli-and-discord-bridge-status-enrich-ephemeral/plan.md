---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: plan
---

# Plan

1. Add `src/version.ts` (+ git tip helper); bump package.json; wire CLI + bridge.
2. Enrich `formatStatusReport` / `/status` handler; optional SlashContext fields for env/cwd.
3. Spec deltas (cli + discord); STATUS note; fixture tests.
4. `specsync change check` → review → ship → PR → squash-merge when green.
