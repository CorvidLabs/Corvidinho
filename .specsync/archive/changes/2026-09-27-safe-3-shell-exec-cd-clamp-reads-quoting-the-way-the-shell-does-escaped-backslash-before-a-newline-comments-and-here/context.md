---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: context
---

# Context

Bug report (SAFE-3, `hi/safe.md`: shell commands cannot `cd` their way out of
the project root) against the clamp as merged in #187 (d0a8d95):
`firstDisallowedCd` split each fragment with `split(/\s+/)` and only then
removed quotes, so quoted or escaped whitespace broke one shell word into
pieces and only the first piece was checked. Through `sh -c 'eval "$1"'`
(dash), `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`,
`cd a\ b/../..`, `cd 'a b'/../..`, `X="a b" cd /etc` and
`cd sub/..\`+newline+`/..` all passed the clamp and ran outside the root.

#210 (15cbe4f) replaced the splitter with a quote-aware tokenizer before this
change started, and it already refuses all six reported forms. Probing that
tokenizer against dash found the same class of bug still open — the clamp's
idea of what is quoted or code drifts from the shell's, and a real `cd` hides:

- `echo a\\`+newline+`cd /etc`: `joinContinuations` removed `\`+newline even
  when that backslash was itself escaped, deleting a real newline.
- `echo #"`+newline+`cd /etc #"`: `#` comments were not recognised, so the
  quote inside the comment opened a string that swallowed the `cd`.
- `cat <<EOF`+newline+`"`+newline+`EOF`+newline+`cd /etc #"`: here-doc
  bodies were tokenized as code, so a lone quote in the body did the same.
- `x=$(echo hi # )"`+newline+`); cd /etc #"`: the end of `$(…)` was found by
  a separate paren matcher that ignored comments and here-docs.
- `cd "sub`, `cd 'sub`, `cd sub\`: nothing refused a `cd` the text leaves
  open, which the report asks to fail closed.

Each printed a path outside the root (or would, for the open forms) while
`firstDisallowedCd` returned null. PR #200 (branch
`claude/fix-shell-cd-clamp-options`) is superseded and not reused: its
"unparseable word" rule also refused `cd "sub dir"`.

Constraints: bug fix only; no new flag, env var, command or package bump; no
CHANGELOG/STATUS edit. Command text is untrusted. The clamp stays lexical
(REQ-plugins-087); a mount or chroot sandbox is out of scope.
