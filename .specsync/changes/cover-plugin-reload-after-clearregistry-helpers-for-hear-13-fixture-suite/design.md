---
change: cover-plugin-reload-after-clearregistry-helpers-for-hear-13-fixture-suite
artifact: design
---

# Design

Replace module-level `loaded` booleans with `get(commandName)` presence
checks before `register`. `loadBuiltins` retries when registry `size()===0`
after a clear. No new public plugin commands.
