---
change: cover-non-discord-plugin-reload-after-clearregistry-for-hear-13-fixtures
artifact: context
---

# Context

Cover change for non-discord plugin loaders touched for HEAR #13 fixtures:
`src/plugins/builtins.ts` and github/meta/specsync loaders re-register after
`clearRegistry()`. `plugins/discord` stays under the main discord change.
