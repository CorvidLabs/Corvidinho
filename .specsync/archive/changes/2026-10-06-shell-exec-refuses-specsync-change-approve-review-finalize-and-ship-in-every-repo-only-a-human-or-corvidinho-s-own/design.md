---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: design
---

# Design

- **`plugins/shell/sdd-lifecycle.ts`** (new): `firstLifecycleStep(cmd, root)`
  walks the command with the SAFE-21 walker (`forEachSimpleCommand`, so the
  dash and bash readings, `eval` / `trap` / `-c` strings, command
  substitutions and in-root scripts run in a shell are all read) and, in each
  simple command, starts an invocation at every word whose basename (less an
  npm `@version`) is `specsync`, at a command word (`commandChain` link)
  that is a path to an existing link named `specsync`, and at a command word
  that expands (only a literal step refuses there). Scanning every word, not
  only chain links, covers wrappers the chain knows (`env`, `timeout`,
  `nohup`, `xargs`, `sudo`, `exec`, `find -exec`) and ones it does not
  (`bunx`, `npx`, `bun x`, `pnpm dlx`, `cargo run --bin specsync --`). The
  subcommand scan skips options and what may be their values, reading every
  literal `change` it reaches; the step scan does the same, and a lifecycle
  step right after an option counts (fail closed). An expanding step refuses;
  under `xargs` a missing step or one outside SpecSync's other `change`
  subcommands refuses. `lifecycleRefuseMessage` / `lifecycleRefusal` build
  the exit-2 result with `HUMAN_LIFECYCLE_LINE` (imported from
  `src/agent/repo-ways.ts`, read only at call time, so the import cycle
  through the builtins is harmless).
- **`plugins/shell/commands.ts`**: `lifecycleRefusal` runs first in the
  handler, before SAFE-21 and the clamp, so any lifecycle command names
  AGENT-18.a; the tool description says so.
- **`plugins/shell/must-ask.ts`**: `shellProdWhy` returns null for a command
  the check refuses, like SAFE-21 and the clamp, so no Approve card is raised
  for a command that will be refused.
- **Not changed**: the SpecSync plugin's approve / finalize tools and
  `runTask`'s settle (REQ-plugins-519, REQ-agent-519) spawn `specsync`
  directly (`spawnSpecsync`), never through `shell-exec`, so Corvidinho's own
  green-lane settle is untouched.
- Alternatives ruled out: a repo check in the shell (AGENT-18.a gives the
  shell no case where it may approve; the settle path is the only one);
  dropping `specsync` from the child's PATH (an absolute path still runs it,
  and read-only steps must keep working); parsing interpreter code (stated
  residual).
