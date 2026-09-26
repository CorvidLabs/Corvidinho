---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: plan
---

# Plan

1. Read issue #112, captured HI, fledge CLI + crate source for real JSON/argv shapes.
2. Add `plugins/fledge/{spawn,discover,commands,index}.ts`.
3. Add `src/plugins/toolCost.ts`; extract `toolDefForEntry` in `src/agent/tools.ts`; optional `origin` on `PluginCommand`.
4. Hook `plugins list` / `plugins run fledge-*` in `src/cli.ts` and the includeDangerous path in `src/agent/execute.ts`.
5. Fixture tests with a fake fledge on a temp PATH (`tests/fledge.plugins.test.ts`, `tests/fledge.cli.test.ts`).
6. Spec deltas REQ-plugins-112..114, REQ-cli-112, REQ-agent-112; list new files in `specs/plugins/plugins.spec.md`.
7. `specsync change check --commit`, `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
