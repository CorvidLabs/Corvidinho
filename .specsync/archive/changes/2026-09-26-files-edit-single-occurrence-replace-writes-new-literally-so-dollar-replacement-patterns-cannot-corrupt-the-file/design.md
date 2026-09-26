---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: design
---

# Design

- Single-occurrence `files-edit` uses a function replacer, `original.replace(oldStr, () => newStr)`, so `--new` is inserted as literal data. The existing uniqueness check (refuse when `--old` appears more than once) still runs first, so the first match is the only match.
- `--replace-all` is unchanged (split/join was already literal); both modes now write `--new` byte-for-byte.
- SAFE-2 protected-path refusal, the path clamp and the size-explosion guard are untouched and still run on the computed content.
- No new env vars, flags or slash commands.
