---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: requirements
---

# Requirements

SAFE intent (guards live in the tool layer) and data integrity for the code-tier file tools (PLUGIN-1, issue #81 files builtins). Added REQ-plugins-237: `files-edit` writes `--new` byte-for-byte in both single-occurrence and `--replace-all` modes; JavaScript replacement patterns in `--new` are never expanded.
