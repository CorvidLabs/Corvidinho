---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: Public API names `listRegisteredModules`
  and its fallback; new invariant paragraph on the listing source; scenario
  "SpecSync project without registry.toml"; error row; files list gains
  `tests/specsync.registry-fallback.test.ts`; change log row; version 50.
- `specs/plugins/requirements.md`: REQ-plugins-008 acceptance bullets.
- `specs/agent/agent.spec.md`: the error row "SpecSync registry missing →
  Planning soft-fails" now says Planning lists `specs/` modules instead and
  only soft-fails when there are none.
- `specs/plugins/plugins.spec.md` also gains the scenario "SpecSync
  registry.toml older than specs/".
- `plugins/specsync/commands.ts`: `specsync-list` tool description.
- README / STATUS / docs do not claim the registry is required, so they are
  unchanged. No CHANGELOG version section and no package bump.
