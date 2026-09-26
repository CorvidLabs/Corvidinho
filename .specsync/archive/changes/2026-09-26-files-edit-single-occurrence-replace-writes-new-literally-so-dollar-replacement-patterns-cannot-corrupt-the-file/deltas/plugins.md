---
module: plugins
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
---

# Delta — plugins (files-edit writes --new literally)

## Added

### REQUIREMENT REQ-plugins-237

`files-edit` SHALL write the `--new` string byte-for-byte in place of the
`--old` match in both single-occurrence and `--replace-all` modes.
JavaScript replacement patterns in `--new` (`$$`, `$&`, `$'`, `` $` ``,
`$1`, `$<name>`) SHALL NOT be expanded; `--new` is literal data.

Acceptance Criteria
- A single-occurrence edit whose `--new` contains `$$`, `$'`, `$&`, `` $` ``, `$1` and `$<n>` leaves exactly that text in the file.
- A `--replace-all` edit with the same `--new` writes the same literal text at every match.
