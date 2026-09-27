---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: plan
---

# Plan

1. Add `tests/shell.clamp-quoting.test.ts`: the six reported forms, the escaped
   `\`+newline, comment, here-doc and `$( )` forms, the open-quote /
   trailing-`\` refusals and in-root allow cases (unit), plus a `runPlugin`
   end-to-end block (exit 2, SAFE-3, no spawn; in-root forms still run).
   Confirm the new cases fail on `main`.
2. Rework the tokenizer in `plugins/shell/clamp.ts`: in-tokenizer
   continuations, `#` comments, here-doc bodies with both `<<` readings,
   `$( )` ends found by the tokenizer, and the open cd/pushd refusal.
3. Modify REQ-plugins-087 (delta); update the plugins spec invariant, scenario,
   error rows and files list.
4. Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`
   and `fledge lanes run verify --non-interactive`; re-run the differential
   fuzz against dash and `bash --posix`.
