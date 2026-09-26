---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: research
---

# Research

Checked on Bun 1.4.2:

- `String.prototype.replace(string, string)` expands `$$`, `$&`, `$'` and `` $` `` in the replacement even when the pattern is a plain string (`$1` / `$<name>` stay literal only because a string pattern has no groups).
- A function replacer's return value is inserted verbatim; no pattern expansion is applied.
- `split(old).join(new)` (the `--replace-all` path) never expands patterns.
- The other `.replace` calls in `plugins/files/commands.ts` use fixed literal replacements, so only the single-occurrence edit was affected.
