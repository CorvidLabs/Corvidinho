---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: design
---

# Design

- Every word of a fragment gets quote and backslash removal (`dequote`) before it is compared, so `'cd'`, `\cd` and `".."/..` are seen as the shell sees them.
- The clamp walks past prefix words (`{ } ! if then else elif do while until time builtin command eval`, plus any `-opt` words right after them), `function NAME`, and `NAME=value` assignments to find the command word. Separators are unchanged.
- After `cd` / `pushd` it skips option words (`-[A-Za-z@]+`) and a `--` to reach the real target. No target (bare, or only options) is still `$HOME`. `-` is refused as `$OLDPWD`.
- A target containing `$`, a backtick, `*`, `?`, `[` or `{` is refused: the shell would expand it, so the lexical check cannot know where it lands.
- If the command text (after quote removal) mentions `CDPATH`, a relative target whose first component is not `.` or `..` is refused as `$CDPATH/<target>`.
- `shell-exec` deletes `CDPATH` and `OLDPWD` from the child env, so the bot's own environment cannot redirect a plain relative `cd`. No new env var, command or flag; the refusal is still exit 2 with the SAFE-3 message.
