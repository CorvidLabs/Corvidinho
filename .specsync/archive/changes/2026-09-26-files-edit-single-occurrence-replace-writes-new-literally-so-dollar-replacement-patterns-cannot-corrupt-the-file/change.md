---
id: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
state: archived
type: bug_fix
base_commit: 3720b97c0dfc6ee65187a6278c13f8e1058632d3
---

# Files-edit single-occurrence replace writes --new literally so dollar replacement patterns cannot corrupt the file (plugins-exec-5)

## Intent

files-edit single-occurrence replace writes --new literally so dollar replacement patterns cannot corrupt the file (plugins-exec-5)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- files-edit without --replace-all writes --new byte-for-byte: $$, $&, $', $` and $<n> in --new are not expanded as String.replace patterns, matching the --replace-all path

## No-spec Rationale

Not applicable
