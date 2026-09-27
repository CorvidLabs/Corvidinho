---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: requirements
---

# Requirements

- SAFE-3 (captured in `hi/safe.md`): shell commands cannot `cd` their way out of the project root.
- Modify REQ-plugins-087 (delta `deltas/plugins.md`): the clamp tokenizes the way the shell reads a command — quotes and escapes join one word, `\`-newline outside single quotes is a continuation but an escaped `\` before a newline is not, `#` comments run to the end of the line, a `$(…)` ends where those rules say, and a command with `<<` is checked both as a here-doc (dash) and as code (bash arithmetic); a `cd` / `pushd` left open by an unterminated quote or trailing `\` refuses.
- No new REQ, env var, command, flag or package version.
