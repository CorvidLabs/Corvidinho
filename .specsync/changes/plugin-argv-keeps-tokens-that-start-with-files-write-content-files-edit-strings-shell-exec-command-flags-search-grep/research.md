---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: research
---

# Research

- `plugins/files/commands.ts`, `plugins/search/commands.ts` and
  `plugins/shell/commands.ts` each carried the same `flagValue` (rejects
  values starting with `--`) and a positional pass that drops `--*`.
- `plugins/git/commands.ts` already has a strict parser (`--` ends options,
  `--flag=value`, value taken verbatim). The new helper follows the same
  shape but keeps unknown tokens positional instead of refusing them, so a
  `--`-leading pattern or content line still works.
- Repro before the fix: `tests/plugins.argv-dashes.test.ts` 0 pass / 9 fail
  (content written as `""`, `git push origin main` without `--dry-run`,
  grep count 2 for `src` instead of 1 for `--no-verify`).
