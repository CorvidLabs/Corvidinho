---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: research
---

# Research

- `plugins/shell/clamp.ts` `tokenize`: `expands` is set only for `$`,
  `$(…)` and backticks (and an ANSI-C escape); `EXPANSION = /[$`*?[{]/` is
  applied to cd targets and script paths only, after quote removal, so it
  cannot tell `'*'` from `*`. That is why `./spec*ync …` was already
  refused (SAFE-3: a glob script path) but `spec*ync …` (no slash) was not.
- `plugins/shell/sdd-lifecycle.ts`: `namesSpecsync` (basename equality),
  `stepAfterChange` (`STEPS.has`), `invocationStep` (`change` literal only,
  `return null` for any other first non-option word), `commandStep`
  (`unknown` only for an expanding command word; `fed` only for a literal
  `xargs`).
- dash (`/bin/sh` here, which `shell-exec` runs) does pathname expansion but
  no brace expansion; bash does both. `{approve,}` → `approve` in bash; a
  glob with no match stays literal. A function body is its own simple
  command in the walker (`f() { … }` splits at `(`, `)` and `;`).
- `specsync --help` (6.0) lists the top-level subcommands used for the xargs
  replace-string check.
- dash also expands aliases under `eval` (a newline after `alias s=…`), and
  bash with `extglob` reads `@(…)`; both are outside the two findings and
  stated as residuals.
