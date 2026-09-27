---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: docs
---

# Docs

- `specs/plugins/requirements.md`: REQ-plugins-083 and REQ-plugins-182 text and acceptance criteria match the delta.
- `specs/plugins/plugins.spec.md`: the SAFE-2 protected list in Invariants now names `bunfig.toml`, `.specsync/` state (outside the files of a `.specsync/changes/<id>/` folder) and keystore files or directories instead of "keystore basenames"; the git-commit sentence says keystore paths are any component.
- The refusal message (`protectedRefuseMessage`) lists `.specsync`.
- No operator doc named the old basename-only rule; no CHANGELOG/STATUS edit (bug-fix slice, no version section).
