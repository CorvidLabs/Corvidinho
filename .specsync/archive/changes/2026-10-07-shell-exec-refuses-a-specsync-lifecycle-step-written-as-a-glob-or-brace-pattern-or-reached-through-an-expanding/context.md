---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: context
---

# Context

- #372 (AGENT-18.a, REQ-plugins-1818) made `shell-exec` refuse
  `specsync change approve|review|finalize|ship` in every repo. A post-merge
  review found two defects, each confirmed by an independent refuter:
  1. (major) Shell globbing in the program name or the step word got past
     the check. `namesSpecsync` compared the literal basename to
     `specsync` and `stepAfterChange` the literal word to the steps, and
     the shared tokenizer marked a word as expanding only for `$`: `*`, `?`,
     `[` and bash brace forms stayed literal text. Run from a folder holding a
     file named `specsync`, `spec*ync change approve c1` passed all three
     pre-spawn checks (lifecycle, SAFE-21, SAFE-3) and approved.
  2. (major) An expanding word where the subcommand belongs was let through:
     `invocationStep` read `change` only as a literal word, so a function
     forwarding `"$@"`, `set --` then `"$@"`, `change${IFS}approve` and
     `… | xargs specsync` (xargs supplying everything after `specsync`)
     ran. The module comment and spec said the check fails closed on an
     expanding step, but that only covered a word after a literal `change`.
- Criterion: AGENT-18.a (on main, `hi/agent.md`): "On Corvidinho it may
  approve and archive its own SpecSync change once verify is green; in other
  repos a human approves, reviews and finalizes." No new criterion, no hi
  capture.
