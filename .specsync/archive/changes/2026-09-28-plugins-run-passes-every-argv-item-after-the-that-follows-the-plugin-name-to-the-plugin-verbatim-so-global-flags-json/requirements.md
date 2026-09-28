---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: requirements
---

# Requirements

- PLUGIN-1 / PLUGIN-3 (hi/plugin.md): typed plugins and Fledge plugins get the
  arguments the operator gave them.
- CLI-3 (hi/cli.md): `--non-interactive` is the operator's flag, read before
  the `--`, not from plugin args.
- REQ-cli-004 (`plugins run`) and REQ-cli-143 (`--task` value is task text).
- New canonical requirement REQ-cli-186 (see deltas/cli.md).
