---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: context
---

# Context

An end-to-end check of `origin/main` (642a843) found that `specsync-read` and
`specsync-brief` — tier 0, `dangerous: false`, offered to the model in every
tool-tier catalog — read files outside the project:

- `echo X > $T/outside.md; bun src/cli.ts specsync read ../../../..$T/outside`
  printed `X` (through the legacy flat-spec fallback `specs/<name>.md`).
- `bun src/cli.ts specsync brief ../../../..$T` dumped every `*.md` in `$T`
  (companion scan of `specs/<name>/`).
- A mock-LLM `task run` whose model called `specsync-read` with such a name got
  the outside file back as the tool result.

Cause: `readModuleSpec` / `readCompanions` in `plugins/specsync/api.ts` join
the model-chosen module name onto `specs/` with no validation and no
containment check, and follow symlinks. `files-read` refuses the same path
("Path traversal denied"), so the SpecSync tools were a bypass of the file
tools' project clamp.

Captured HI: SAFE-2 (`hi/safe.md` — the agent's file tools cannot reach
protected project infra; guards live in the tool layer) and PLUGIN-1
(`hi/plugin.md` — SpecSync is available as a typed plugin). Tools stay inside
the project. No new criterion was invented.

Checked every other SpecSync command for the same pattern:

- `specsync-list` reads the fixed `.specsync/registry.toml` and only emits
  names matching `[A-Za-z0-9_-]+`; no model path input. Unchanged.
- `specsync-check` spawns `fledge run spec-check` / `specsync check` with no
  forwarded args. Unchanged.
- `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` forward
  model argv to the `specsync` binary. The binary's global `--root <ROOT>`
  points it at any directory: `specsync coverage --root <outside project>`
  listed the outside project's modules and files. Same pattern, fixed here.
  The binary already rejects a traversal change ID (`invalid change ID`) and
  does not infer abbreviated long flags (`--roo` is an error).
